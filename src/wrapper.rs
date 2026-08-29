use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use crate::{
    events::{LbeEvent, ToolRisk, ValidationStatus},
    memory::mock_memory_records,
    requests::{LbeError, UserRequest},
    types::*,
};

pub(crate) trait LbeWrapper {
    fn snapshot(&self) -> LbeSnapshot;
    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError>;
    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError>;
    fn next_wake(&self, now: Instant) -> Option<Duration>;
}

#[derive(Debug)]
struct ScheduledLbeEvent {
    due_at: Instant,
    event: LbeEvent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolLifecycle {
    Requested,
    Started,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CommandLifecycle {
    Started,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ValidationLifecycle {
    NotStarted,
    Started,
    Passed,
    Failed,
    InsufficientEvidence,
}

#[derive(Debug)]
struct ExecutionStateMachine {
    runtime_ordinal: u64,
    execution_id: Option<String>,
    status: ExecutionStatus,
    deadline: Option<Instant>,
    tools: HashMap<String, ToolLifecycle>,
    commands: HashMap<String, (String, CommandLifecycle)>,
    validation: ValidationLifecycle,
    terminal_emitted: bool,
    next_execution_ordinal: u64,
    next_tool_ordinal: u64,
    next_command_ordinal: u64,
    retry_count: u32,
    retry_limit: u32,
    retry_target: Option<String>,
    retry_source: Option<String>,
    retry_attempt: u32,
    interrupted_deadline: Option<Instant>,
}

impl Default for ExecutionStateMachine {
    fn default() -> Self {
        static NEXT_RUNTIME_ORDINAL: AtomicU64 = AtomicU64::new(0);
        Self {
            runtime_ordinal: NEXT_RUNTIME_ORDINAL.fetch_add(1, Ordering::Relaxed),
            execution_id: None,
            status: ExecutionStatus::Pending,
            deadline: None,
            tools: HashMap::new(),
            commands: HashMap::new(),
            validation: ValidationLifecycle::NotStarted,
            terminal_emitted: false,
            next_execution_ordinal: 0,
            next_tool_ordinal: 0,
            next_command_ordinal: 0,
            retry_count: 0,
            retry_limit: 3,
            retry_target: None,
            retry_source: None,
            retry_attempt: 0,
            interrupted_deadline: None,
        }
    }
}

impl ExecutionStateMachine {
    fn reset_for_new_request(&mut self) {
        self.execution_id = None;
        self.status = ExecutionStatus::Pending;
        self.deadline = None;
        self.tools.clear();
        self.commands.clear();
        self.validation = ValidationLifecycle::NotStarted;
        self.terminal_emitted = false;
        self.retry_count = 0;
        self.retry_target = None;
        self.retry_source = None;
        self.retry_attempt = 0;
        self.interrupted_deadline = None;
    }

    fn begin_approval(&mut self) -> Result<(), LbeError> {
        self.ensure_not_terminal()?;
        if !matches!(self.status, ExecutionStatus::Pending) {
            return Err(LbeError::new(
                "cannot create approval while execution lifecycle is active",
            ));
        }
        self.status = ExecutionStatus::WaitingForApproval;
        Ok(())
    }

    fn reject(&mut self) -> Result<(), LbeError> {
        self.ensure_not_terminal()?;
        if !matches!(self.status, ExecutionStatus::WaitingForApproval) {
            return Err(LbeError::new("rejection requires a pending approval"));
        }
        self.transition_terminal(ExecutionStatus::Rejected)
    }

    fn start_execution(
        &mut self,
        now: Instant,
        timeout: Duration,
    ) -> Result<ExecutionIds, LbeError> {
        self.ensure_not_terminal()?;
        if !matches!(self.status, ExecutionStatus::WaitingForApproval) {
            return Err(LbeError::new("execution start requires approval state"));
        }
        self.next_execution_ordinal += 1;
        self.next_tool_ordinal += 1;
        self.next_command_ordinal += 1;
        let execution_id = if self.runtime_ordinal == 0 && self.next_execution_ordinal == 1 {
            "exec_mock_7f31".to_owned()
        } else {
            format!(
                "exec_mock_r{:04}_{:04}",
                self.runtime_ordinal, self.next_execution_ordinal
            )
        };
        let tool_call_id = if self.runtime_ordinal == 0 && self.next_tool_ordinal == 1 {
            "tool_mock_workspace".to_owned()
        } else {
            format!(
                "tool_mock_workspace_r{:04}_{:04}",
                self.runtime_ordinal, self.next_tool_ordinal
            )
        };
        let command_id = if self.runtime_ordinal == 0 && self.next_command_ordinal == 1 {
            "cmd_mock_check".to_owned()
        } else {
            format!(
                "cmd_mock_check_r{:04}_{:04}",
                self.runtime_ordinal, self.next_command_ordinal
            )
        };
        self.execution_id = Some(execution_id.clone());
        self.status = ExecutionStatus::Running;
        self.deadline = Some(now + timeout);
        self.tools.clear();
        self.commands.clear();
        self.validation = ValidationLifecycle::NotStarted;
        self.terminal_emitted = false;
        self.retry_target = None;
        self.retry_source = None;
        self.retry_attempt = 0;
        self.interrupted_deadline = None;
        Ok(ExecutionIds {
            execution_id,
            tool_call_id,
            command_id,
        })
    }

    fn timeout_due(&self, now: Instant) -> bool {
        matches!(
            self.status,
            ExecutionStatus::Running | ExecutionStatus::Validating
        ) && self.deadline.is_some_and(|deadline| deadline <= now)
    }

    fn next_wake(&self, now: Instant) -> Option<Duration> {
        if matches!(
            self.status,
            ExecutionStatus::Running | ExecutionStatus::Validating
        ) {
            self.deadline
                .map(|deadline| deadline.saturating_duration_since(now))
        } else {
            None
        }
    }

    fn terminal_already_emitted(&self) -> bool {
        self.terminal_emitted
    }

    fn mark_terminal_emitted(&mut self) {
        self.terminal_emitted = true;
    }

    fn apply_event(&mut self, event: &LbeEvent) -> Result<Option<ExecutionStatus>, LbeError> {
        match event {
            LbeEvent::ToolRequested { tool_call_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_running_execution()?;
                if self
                    .tools
                    .insert(tool_call_id.clone(), ToolLifecycle::Requested)
                    .is_some()
                {
                    return Err(LbeError::new("duplicate tool-call ID rejected"));
                }
                Ok(None)
            }
            LbeEvent::ToolStarted { tool_call_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_running_execution()?;
                match self.tools.get_mut(tool_call_id) {
                    Some(lifecycle @ ToolLifecycle::Requested) => {
                        *lifecycle = ToolLifecycle::Started;
                        Ok(None)
                    }
                    Some(_) => Err(LbeError::new("tool start rejected for invalid tool state")),
                    None => Err(LbeError::new("unknown tool-call ID rejected")),
                }
            }
            LbeEvent::ToolCompleted { tool_call_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_running_execution()?;
                match self.tools.get_mut(tool_call_id) {
                    Some(lifecycle @ ToolLifecycle::Started) => {
                        *lifecycle = ToolLifecycle::Completed;
                        Ok(None)
                    }
                    Some(_) => Err(LbeError::new(
                        "tool completion rejected for invalid tool state",
                    )),
                    None => Err(LbeError::new("unknown tool-call ID rejected")),
                }
            }
            LbeEvent::ToolFailed { tool_call_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_running_execution()?;
                match self.tools.get_mut(tool_call_id) {
                    Some(lifecycle @ ToolLifecycle::Started) => {
                        *lifecycle = ToolLifecycle::Failed;
                        self.transition_terminal(ExecutionStatus::Failed)?;
                        Ok(Some(ExecutionStatus::Failed))
                    }
                    Some(_) => Err(LbeError::new(
                        "tool failure rejected for invalid tool state",
                    )),
                    None => Err(LbeError::new("unknown tool-call ID rejected")),
                }
            }
            LbeEvent::RetryScheduled {
                execution_id,
                retry_source,
                retry_target,
                retry_count,
                retry_limit,
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                if *retry_limit == 0 || *retry_count != self.retry_count + 1 {
                    return Err(LbeError::new("retry count or limit is invalid"));
                }
                if *retry_count > *retry_limit {
                    return Err(LbeError::new("retry exceeds configured limit"));
                }
                if retry_source.trim().is_empty() || retry_target.trim().is_empty() {
                    return Err(LbeError::new("retry identities must not be empty"));
                }
                if self.tools.get(retry_source) != Some(&ToolLifecycle::Completed)
                    && self.tools.get(retry_source) != Some(&ToolLifecycle::Failed)
                {
                    return Err(LbeError::new("retry source must be a finished tool"));
                }
                if self.tools.contains_key(retry_target) || self.commands.contains_key(retry_target)
                {
                    return Err(LbeError::new("retry target identity must be fresh"));
                }
                self.retry_count = *retry_count;
                self.retry_limit = *retry_limit;
                self.retry_target = Some(retry_target.clone());
                self.retry_source = Some(retry_source.clone());
                self.retry_attempt += 1;
                self.tools
                    .insert(retry_target.clone(), ToolLifecycle::Requested);
                Ok(None)
            }
            LbeEvent::RetryLimitReached {
                execution_id,
                retry_source,
                retry_target,
                retry_limit,
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                if *retry_limit != self.retry_limit
                    || self.retry_count < self.retry_limit
                    || self.retry_target.as_deref() != Some(retry_target.as_str())
                    || self.retry_source.as_deref() != Some(retry_source.as_str())
                {
                    return Err(LbeError::new("retry limit transition is invalid"));
                }
                self.transition_terminal(ExecutionStatus::Failed)?;
                Ok(Some(ExecutionStatus::Failed))
            }
            LbeEvent::ExecutionInterrupted { execution_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                self.status = ExecutionStatus::Interrupted;
                self.interrupted_deadline = self.deadline.take();
                Ok(Some(ExecutionStatus::Interrupted))
            }
            LbeEvent::ExecutionResumed { execution_id } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                if !matches!(self.status, ExecutionStatus::Interrupted) {
                    return Err(LbeError::new("execution resume requires interrupted state"));
                }
                self.status = ExecutionStatus::Running;
                self.deadline = self.interrupted_deadline.take();
                Ok(Some(ExecutionStatus::Running))
            }
            LbeEvent::CommandStarted {
                tool_call_id,
                command_id,
                ..
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_running_execution()?;
                if self.tools.get(tool_call_id) != Some(&ToolLifecycle::Started) {
                    return Err(LbeError::new("command start requires started tool"));
                }
                if self
                    .commands
                    .insert(
                        command_id.clone(),
                        (tool_call_id.clone(), CommandLifecycle::Started),
                    )
                    .is_some()
                {
                    return Err(LbeError::new("duplicate command ID rejected"));
                }
                Ok(None)
            }
            LbeEvent::CommandStdoutDelta {
                tool_call_id,
                command_id,
                ..
            }
            | LbeEvent::CommandStderrDelta {
                tool_call_id,
                command_id,
                ..
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_command_started(tool_call_id, command_id)?;
                Ok(None)
            }
            LbeEvent::CommandCompleted {
                tool_call_id,
                command_id,
                ..
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_command_started(tool_call_id, command_id)?;
                if let Some((_, lifecycle)) = self.commands.get_mut(command_id) {
                    *lifecycle = CommandLifecycle::Completed;
                }
                Ok(None)
            }
            LbeEvent::CommandFailed {
                tool_call_id,
                command_id,
                ..
            } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_command_started(tool_call_id, command_id)?;
                if let Some((_, lifecycle)) = self.commands.get_mut(command_id) {
                    *lifecycle = CommandLifecycle::Failed;
                }
                self.transition_terminal(ExecutionStatus::Failed)?;
                Ok(Some(ExecutionStatus::Failed))
            }
            LbeEvent::AgentRequestedCompletion { execution_id } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                Ok(None)
            }
            LbeEvent::ExecutionCompleted { execution_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                Ok(None)
            }
            LbeEvent::ValidationStarted { execution_id } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                self.ensure_running_execution()?;
                if !matches!(self.validation, ValidationLifecycle::NotStarted) {
                    return Err(LbeError::new("duplicate validation start rejected"));
                }
                self.validation = ValidationLifecycle::Started;
                self.status = ExecutionStatus::Validating;
                Ok(Some(ExecutionStatus::Validating))
            }
            LbeEvent::ValidationCompleted { status, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                if !matches!(self.validation, ValidationLifecycle::Started) {
                    return Err(LbeError::new(
                        "validation completion requires validation start",
                    ));
                }
                match status {
                    ValidationStatus::Passed => {
                        self.validation = ValidationLifecycle::Passed;
                        Ok(None)
                    }
                    ValidationStatus::Failed | ValidationStatus::InsufficientEvidence => {
                        self.validation = match status {
                            ValidationStatus::Failed => ValidationLifecycle::Failed,
                            ValidationStatus::InsufficientEvidence => {
                                ValidationLifecycle::InsufficientEvidence
                            }
                            ValidationStatus::Passed => ValidationLifecycle::Passed,
                        };
                        self.transition_terminal(ExecutionStatus::Failed)?;
                        Ok(Some(ExecutionStatus::Failed))
                    }
                }
            }
            LbeEvent::LbeCompletionAccepted { execution_id, .. } => {
                self.ensure_not_terminal_lifecycle()?;
                self.ensure_execution_id(execution_id)?;
                if !matches!(self.validation, ValidationLifecycle::Passed) {
                    return Err(LbeError::new(
                        "completion acceptance requires passed validation",
                    ));
                }
                self.transition_terminal(ExecutionStatus::Completed)?;
                Ok(Some(ExecutionStatus::Completed))
            }
            _ => Ok(None),
        }
    }

    fn transition_terminal(&mut self, status: ExecutionStatus) -> Result<(), LbeError> {
        if self.status.is_terminal() {
            return Err(LbeError::new("duplicate terminal transition rejected"));
        }
        if !status.is_terminal() {
            return Err(LbeError::new(
                "non-terminal transition rejected by terminal path",
            ));
        }
        self.status = status;
        self.deadline = None;
        Ok(())
    }

    fn ensure_not_terminal(&self) -> Result<(), LbeError> {
        if self.status.is_terminal() {
            Err(LbeError::new("request rejected after terminal state"))
        } else {
            Ok(())
        }
    }

    fn ensure_not_terminal_lifecycle(&self) -> Result<(), LbeError> {
        if self.status.is_terminal() {
            Err(LbeError::new(
                "lifecycle event rejected after terminal state",
            ))
        } else {
            Ok(())
        }
    }

    fn ensure_running_execution(&self) -> Result<(), LbeError> {
        if matches!(
            self.status,
            ExecutionStatus::Running | ExecutionStatus::Validating
        ) {
            Ok(())
        } else {
            Err(LbeError::new("event requires running execution"))
        }
    }

    fn ensure_execution_id(&self, execution_id: &str) -> Result<(), LbeError> {
        if self.execution_id.as_deref() == Some(execution_id) {
            Ok(())
        } else {
            Err(LbeError::new("unknown execution ID rejected"))
        }
    }

    fn ensure_command_started(&self, tool_call_id: &str, command_id: &str) -> Result<(), LbeError> {
        self.ensure_running_execution()?;
        match self.commands.get(command_id) {
            Some((parent_tool_call_id, CommandLifecycle::Started))
                if parent_tool_call_id == tool_call_id =>
            {
                Ok(())
            }
            Some((_, CommandLifecycle::Started)) => {
                Err(LbeError::new("wrong command/tool relationship rejected"))
            }
            Some(_) => Err(LbeError::new("command terminal duplicate rejected")),
            None => Err(LbeError::new("unknown command ID rejected")),
        }
    }
}

#[derive(Debug)]
struct ExecutionIds {
    execution_id: String,
    tool_call_id: String,
    command_id: String,
}

#[derive(Debug)]
pub(crate) struct MockLbeWrapper {
    snapshot: LbeSnapshot,
    scheduled: VecDeque<ScheduledLbeEvent>,
    pending_approval_id: Option<String>,
    next_approval_ordinal: u64,
    execution: ExecutionStateMachine,
}

impl MockLbeWrapper {
    fn is_blocked_post_terminal_lifecycle_event(event: &LbeEvent) -> bool {
        matches!(
            event,
            LbeEvent::ExecutionRejected { .. }
                | LbeEvent::TimedOut { .. }
                | LbeEvent::LbeCompletionAccepted { .. }
                | LbeEvent::ExecutionStarted { .. }
                | LbeEvent::AgentRequestedCompletion { .. }
                | LbeEvent::ExecutionCompleted { .. }
                | LbeEvent::ValidationStarted { .. }
                | LbeEvent::ValidationCompleted { .. }
                | LbeEvent::ToolRequested { .. }
                | LbeEvent::ToolStarted { .. }
                | LbeEvent::ToolOutputDelta { .. }
                | LbeEvent::ToolCompleted { .. }
                | LbeEvent::ToolFailed { .. }
                | LbeEvent::CommandStarted { .. }
                | LbeEvent::CommandStdoutDelta { .. }
                | LbeEvent::CommandStderrDelta { .. }
                | LbeEvent::CommandCompleted { .. }
                | LbeEvent::CommandFailed { .. }
                | LbeEvent::CommandDetached { .. }
                | LbeEvent::DetachedCommandProgress { .. }
                | LbeEvent::DetachedCommandCompleted { .. }
                | LbeEvent::DetachedLogAvailable { .. }
                | LbeEvent::RetryScheduled { .. }
                | LbeEvent::RetryLimitReached { .. }
        )
    }

    fn emit(&mut self, event: LbeEvent) {
        self.scheduled.push_back(ScheduledLbeEvent {
            due_at: Instant::now(),
            event,
        });
    }

    fn emit_snapshot(&mut self) {
        self.emit(LbeEvent::SnapshotUpdated {
            snapshot: self.snapshot(),
        });
    }

    fn set_execution_status(&mut self, status: ExecutionStatus) {
        self.snapshot.execution_status = Some(status);
        self.snapshot.session_state = status.session_status();
    }

    fn emit_execution_status(&mut self) {
        self.emit(LbeEvent::SessionStatusUpdated {
            status: self.snapshot.session_state,
            execution_id: self.snapshot.active_execution_id.clone(),
        });
        self.emit_snapshot();
    }

    fn schedule(&mut self, due_at: Instant, event: LbeEvent) {
        self.scheduled
            .push_back(ScheduledLbeEvent { due_at, event });
    }

    fn terminalize(&mut self, status: ExecutionStatus, terminal_event: LbeEvent) {
        self.scheduled.clear();
        self.set_execution_status(status);
        if !self.execution.terminal_already_emitted() {
            self.emit(terminal_event);
            self.emit_execution_status();
        }
    }

    fn validate_and_emit_due_event(
        &mut self,
        scheduled: ScheduledLbeEvent,
    ) -> Result<Option<LbeEvent>, LbeError> {
        if let LbeEvent::CheckpointCreated { checkpoint } = &scheduled.event {
            self.snapshot.latest_checkpoint = Some(checkpoint.clone());
        }
        if self.execution.status.is_terminal()
            && Self::is_blocked_post_terminal_lifecycle_event(&scheduled.event)
        {
            if !self.execution.terminal_already_emitted() {
                self.execution.mark_terminal_emitted();
                return Ok(Some(scheduled.event));
            }
            return Ok(None);
        }
        match self.execution.apply_event(&scheduled.event) {
            Ok(Some(status)) => {
                self.set_execution_status(status);
                if status.is_terminal() || status == ExecutionStatus::Interrupted {
                    self.scheduled.clear();
                }
                let event = scheduled.event;
                if status.is_terminal() {
                    self.execution.mark_terminal_emitted();
                    self.emit_execution_status();
                }
                Ok(Some(event))
            }
            Ok(None) => Ok(Some(scheduled.event)),
            Err(error) => {
                if self.execution.status == ExecutionStatus::Interrupted {
                    return Ok(None);
                }
                if matches!(
                    scheduled.event,
                    LbeEvent::RetryScheduled { .. }
                        | LbeEvent::RetryLimitReached { .. }
                        | LbeEvent::ExecutionInterrupted { .. }
                        | LbeEvent::ExecutionResumed { .. }
                ) {
                    return Ok(None);
                }
                self.scheduled.clear();
                if !self.execution.status.is_terminal() {
                    self.execution
                        .transition_terminal(ExecutionStatus::Failed)?;
                    self.set_execution_status(ExecutionStatus::Failed);
                    self.execution.mark_terminal_emitted();
                    self.emit_execution_status();
                }
                Ok(Some(LbeEvent::ToolFailed {
                    execution_id: self.execution.execution_id.clone().unwrap_or_default(),
                    tool_call_id: "runtime_state_machine".to_owned(),
                    message: error.message,
                }))
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn set_timeout_seconds_for_test(&mut self, timeout_seconds: u64) {
        self.snapshot.timeout_seconds = timeout_seconds;
    }

    #[cfg(test)]
    pub(crate) fn inject_due_event_for_test(&mut self, event: LbeEvent, now: Instant) {
        self.scheduled
            .push_front(ScheduledLbeEvent { due_at: now, event });
    }

    #[cfg(test)]
    pub(crate) fn retry_state_for_test(&self) -> (u32, u32, Option<String>, u32) {
        (
            self.execution.retry_count,
            self.execution.retry_limit,
            self.execution.retry_target.clone(),
            self.execution.retry_attempt,
        )
    }
}

impl Default for MockLbeWrapper {
    fn default() -> Self {
        Self {
            snapshot: LbeSnapshot::default(),
            scheduled: VecDeque::new(),
            pending_approval_id: None,
            next_approval_ordinal: 0,
            execution: ExecutionStateMachine::default(),
        }
    }
}
impl LbeWrapper for MockLbeWrapper {
    fn snapshot(&self) -> LbeSnapshot {
        self.snapshot.clone()
    }

    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError> {
        match request {
            UserRequest::SubmitTask { intent, mode } => match mode {
                AgentMode::Regular => {
                    if self.execution.status.is_terminal() {
                        self.execution.reset_for_new_request();
                        self.snapshot.active_execution_id = None;
                        self.snapshot.execution_status = None;
                    }
                    self.execution.begin_approval()?;
                    self.next_approval_ordinal += 1;
                    let approval_id = format!("apr_mock_{:04}", self.next_approval_ordinal);
                    self.pending_approval_id = Some(approval_id.clone());
                    self.set_execution_status(ExecutionStatus::WaitingForApproval);
                    self.emit(LbeEvent::ProposalCreated {
                        approval_id,
                        proposal: format!("Proposed: {intent}"),
                    });
                    self.emit_execution_status();
                }
                AgentMode::Plan => self.emit(LbeEvent::PlanUpdated {
                    text: format!("Mock plan: investigate {intent}; no execution."),
                }),
                AgentMode::Audit => self.emit(LbeEvent::AuditVerdict {
                    verdict: "INSUFFICIENT_EVIDENCE · mock runtime not connected to LBE guards."
                        .to_owned(),
                }),
            },
            UserRequest::Continue {
                session_id,
                message,
            } => {
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return Err(LbeError {
                        message: "session ID is not active in the mock runtime".to_owned(),
                    });
                }
                self.snapshot.turn_id = Some("turn_mock_1".to_owned());
                self.emit_snapshot();
                self.emit(LbeEvent::AssistantTextDelta {
                    text: format!("Mock follow-up received: {message}"),
                });
            }
            UserRequest::RefreshRuntimeSnapshot => {
                return Err(LbeError::new(
                    "runtime snapshot refresh is unavailable in mock mode",
                ));
            }
            UserRequest::InspectWorkspace { .. } => {
                return Err(LbeError::new(
                    "governed workspace inspection is unavailable in mock mode",
                ));
            }
            UserRequest::ListWorkspace { .. } => {
                return Err(LbeError::new(
                    "governed workspace listing is unavailable in mock mode",
                ));
            }
            UserRequest::GlobWorkspace { .. } => {
                return Err(LbeError::new(
                    "governed workspace globbing is unavailable in mock mode",
                ));
            }
            UserRequest::SearchWorkspace { .. } => {
                return Err(LbeError::new(
                    "governed workspace search is unavailable in mock mode",
                ));
            }
            UserRequest::PatchWorkspace { .. } => {
                return Err(LbeError::new(
                    "governed workspace patching is unavailable in mock mode",
                ));
            }
            UserRequest::RefreshProviderCatalog => {
                self.emit(LbeEvent::ProviderDiscoveryStarted);
                let providers = self.snapshot.providers.clone();
                self.emit(LbeEvent::ProviderCatalogDiscovered {
                    providers: providers.clone(),
                });
                for p in &providers {
                    self.emit(LbeEvent::ProviderValidationStarted {
                        provider_id: p.provider_id,
                    });
                    self.emit(LbeEvent::ProviderAuthStateUpdated {
                        provider_id: p.provider_id,
                        auth_state: p.auth_state,
                    });
                    self.emit(LbeEvent::ProviderHealthUpdated {
                        provider_id: p.provider_id,
                        health: p.health,
                    });
                    self.emit(LbeEvent::ProviderValidationCompleted {
                        provider_id: p.provider_id,
                    });
                }
                self.emit(LbeEvent::ModelCatalogDiscovered {
                    models: self.snapshot.models.clone(),
                });
                let discovered = providers.iter().map(|p| p.provider_id).collect::<Vec<_>>();
                self.emit(LbeEvent::ProviderDiscoveryCompleted {
                    providers: discovered,
                });
            }
            UserRequest::CompactContext => {
                if !self.snapshot.compaction_available {
                    self.emit(LbeEvent::ContextCompactionFailed {
                        message: "Context compaction unavailable in mock runtime.".to_owned(),
                    });
                } else {
                    self.snapshot.compaction_state = CompactionState::Suggested;
                    self.emit(LbeEvent::ContextCompactionSuggested);
                    self.snapshot.compaction_state = CompactionState::Running;
                    self.emit(LbeEvent::ContextCompactionStarted);
                    self.snapshot.context_used = 1;
                    self.snapshot.compaction_state = CompactionState::Completed;
                    self.emit(LbeEvent::ContextCompactionCompleted { context_used: 1 });
                    self.emit_snapshot();
                }
            }
            UserRequest::RunDiagnostics => {
                self.emit(LbeEvent::DiagnosticsUpdated {
                    checks: self.snapshot.diagnostics.clone(),
                });
            }
            UserRequest::Approve { approval_id } => {
                if self.pending_approval_id.as_deref() != Some(approval_id.as_str()) {
                    return Err(LbeError {
                        message: "approval ID is not pending in the mock runtime".to_owned(),
                    });
                }
                self.pending_approval_id = None;
                self.scheduled.clear();
                let ids = self
                    .execution
                    .start_execution(now, Duration::from_secs(self.snapshot.timeout_seconds))?;
                self.snapshot.active_execution_id = Some(ids.execution_id.clone());
                self.set_execution_status(ExecutionStatus::Running);
                self.emit(LbeEvent::ExecutionStarted {
                    execution_id: ids.execution_id.clone(),
                });
                self.emit_execution_status();
                self.schedule(
                    now + Duration::from_millis(250),
                    LbeEvent::CheckpointCreated {
                        checkpoint: CheckpointDescriptor {
                            checkpoint_id: if ids.execution_id == "exec_mock_7f31" {
                                "chk_mock_before_exec".to_owned()
                            } else {
                                format!("chk_mock_before_{}", ids.execution_id)
                            },
                            created_at: "mock-time".to_owned(),
                            workspace_revision: "mock-rev-7f31".to_owned(),
                            changed_files: vec!["rust/main.rs".to_owned()],
                        },
                    },
                );
                self.schedule(
                    now + Duration::from_millis(300),
                    LbeEvent::ToolRequested {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        tool_name: "workspace.inspect".to_owned(),
                        input_summary: "active workspace".to_owned(),
                        risk: ToolRisk::ReadOnly,
                    },
                );
                self.schedule(
                    now + Duration::from_millis(350),
                    LbeEvent::ToolStarted {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(400),
                    LbeEvent::CommandStarted {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        command_summary: "cargo check (mock only)".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(450),
                    LbeEvent::CommandStdoutDelta {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        text: "Checking mock workspace...".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(500),
                    LbeEvent::CommandStderrDelta {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        text: "mock stderr is display-only".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(550),
                    LbeEvent::CommandCompleted {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        exit_code: 0,
                    },
                );
                self.schedule(
                    now + Duration::from_millis(600),
                    LbeEvent::ToolOutputDelta {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        text: "Mock workspace inspection completed.".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(650),
                    LbeEvent::ToolCompleted {
                        execution_id: ids.execution_id.clone(),
                        tool_call_id: ids.tool_call_id.clone(),
                        evidence_ref: Some("evidence_mock_7f31".to_owned()),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(700),
                    LbeEvent::AgentRequestedCompletion {
                        execution_id: ids.execution_id.clone(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(750),
                    LbeEvent::ExecutionCompleted {
                        execution_id: ids.execution_id.clone(),
                        receipt_id: Some("rcpt_demo_7f31".to_owned()),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(800),
                    LbeEvent::ValidationStarted {
                        execution_id: ids.execution_id.clone(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(900),
                    LbeEvent::ValidationCompleted {
                        execution_id: ids.execution_id.clone(),
                        status: ValidationStatus::Passed,
                        result: "Focused validation complete.".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(950),
                    LbeEvent::LbeCompletionAccepted {
                        execution_id: ids.execution_id,
                        receipt_id: Some("rcpt_demo_7f31".to_owned()),
                    },
                );
            }
            UserRequest::Reject { approval_id } => {
                if self.pending_approval_id.as_deref() != Some(approval_id.as_str()) {
                    return Err(LbeError {
                        message: "approval ID is not pending in the mock runtime".to_owned(),
                    });
                }
                self.pending_approval_id = None;
                self.execution.reject()?;
                self.terminalize(
                    ExecutionStatus::Rejected,
                    LbeEvent::ExecutionRejected { approval_id },
                );
            }
            UserRequest::SelectModel { model } => {
                let in_catalog =
                    self.snapshot.models.iter().any(|c| {
                        c.provider_id == model.provider_id && c.model_id == model.model_id
                    });
                if !in_catalog {
                    return Err(LbeError {
                        message: format!(
                            "model {} is not in the discovered model catalog",
                            model.model_id
                        ),
                    });
                }
                self.snapshot.selected_model = Some(model);
                self.emit_snapshot();
            }
            UserRequest::SetMode { mode } => {
                self.snapshot.active_mode = mode;
                self.emit_snapshot();
            }
            UserRequest::RecallSessionMemory { query, limit } => {
                self.emit(LbeEvent::MemoryRecallStarted {
                    query: query.clone(),
                });
                let mut records = mock_memory_records(&query);
                records.truncate(limit);
                self.snapshot.memory.last_recall_query = Some(query.clone());
                self.snapshot.memory.indexed_sessions =
                    self.snapshot.memory.indexed_sessions.max(1);
                self.snapshot.memory.indexed_memories =
                    self.snapshot.memory.indexed_memories.max(records.len());
                self.snapshot.memory.recent_records = records.clone();
                if records.is_empty() {
                    self.emit(LbeEvent::MemoryRecallEmpty { query });
                } else {
                    self.emit(LbeEvent::MemoryRecallResult { query, records });
                }
            }
            UserRequest::RecallSession { session_id } => {
                let session_hash = self
                    .snapshot
                    .memory
                    .current_session_hash
                    .clone()
                    .unwrap_or_else(|| "sha256:mock-session-92d7c3".to_owned());
                self.emit(LbeEvent::SessionMemoryIndexed {
                    session_id,
                    session_hash,
                });
            }
            UserRequest::CreateMemoryCheckpoint => {
                self.emit(LbeEvent::MemoryCheckpointCreated {
                    checkpoint_id: "mem_chk_mock_7f31".to_owned(),
                    memory_count: self.snapshot.memory.indexed_memories,
                });
            }
            UserRequest::ForgetSessionMemory { session_id } => {
                return Err(LbeError {
                    message: format!(
                        "session memory for {session_id} is canonical-runtime-owned; mock TUI cannot forget protected records"
                    ),
                });
            }
            UserRequest::AttachBrowserChat {
                provider,
                conversation_ref,
            } => {
                let browser_session_id = "browser_mock_91ac".to_owned();
                self.snapshot.browser_chat.provider = Some(provider.clone());
                self.snapshot.browser_chat.browser_session_id = Some(browser_session_id.clone());
                self.snapshot.browser_chat.lbe_session_id = self.snapshot.session_id.clone();
                self.snapshot.browser_chat.conversation_ref = conversation_ref;
                self.snapshot.browser_chat.attached = true;
                self.snapshot.browser_chat.status = "Waiting for browser assistant".to_owned();
                self.emit(LbeEvent::BrowserChatAttached {
                    browser_session_id,
                    provider,
                });
            }
            UserRequest::DetachBrowserChat => {
                let browser_session_id = self
                    .snapshot
                    .browser_chat
                    .browser_session_id
                    .clone()
                    .unwrap_or_else(|| "browser_mock_91ac".to_owned());
                self.snapshot.browser_chat.attached = false;
                self.snapshot.browser_chat.status = "Detached".to_owned();
                self.emit(LbeEvent::BrowserChatDetached { browser_session_id });
            }
            UserRequest::SendBrowserMessage { content } => {
                if !self.snapshot.browser_chat.attached {
                    return Err(LbeError {
                        message:
                            "browser chat bridge is detached; refusing direct browser fallback"
                                .to_owned(),
                    });
                }
                self.snapshot.turn_id = Some("turn_browser_mock_1".to_owned());
                self.emit(LbeEvent::BrowserMessageReceived {
                    browser_message_id: "browser_msg_mock_1".to_owned(),
                    content,
                });
            }
            UserRequest::ContinueBrowserSession {
                browser_session_id,
                message,
            } => {
                if self.snapshot.browser_chat.browser_session_id.as_deref()
                    != Some(browser_session_id.as_str())
                {
                    return Err(LbeError {
                        message: "browser session is not attached to this LBE session".to_owned(),
                    });
                }
                self.snapshot.turn_id = Some("turn_browser_mock_2".to_owned());
                self.emit(LbeEvent::BrowserMessageReceived {
                    browser_message_id: "browser_msg_mock_2".to_owned(),
                    content: message,
                });
                self.emit(LbeEvent::BrowserToolRequested {
                    browser_message_id: "browser_msg_mock_2".to_owned(),
                    tool_name: "workspace.inspect".to_owned(),
                    input_summary: "mock browser-proposed tool routed through LBE".to_owned(),
                });
                self.emit(LbeEvent::BrowserToolResultDelivered {
                    browser_message_id: "browser_msg_mock_2".to_owned(),
                    tool_call_id: "tool_mock_browser_workspace".to_owned(),
                    receipt_id: Some("rcpt_browser_mock_91ac".to_owned()),
                    evidence_ref: Some("evidence_browser_mock_91ac".to_owned()),
                });
            }
            UserRequest::Abort => {
                self.pending_approval_id = None;
                self.execution
                    .transition_terminal(ExecutionStatus::Aborted)?;
                self.terminalize(
                    ExecutionStatus::Aborted,
                    LbeEvent::ExecutionRejected {
                        approval_id: "aborted".to_owned(),
                    },
                );
            }
        }
        Ok(())
    }

    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError> {
        if self.execution.timeout_due(now) {
            self.execution
                .transition_terminal(ExecutionStatus::TimedOut)?;
            self.terminalize(
                ExecutionStatus::TimedOut,
                LbeEvent::TimedOut {
                    execution_id: self.execution.execution_id.clone().unwrap_or_default(),
                    timeout_seconds: self.snapshot.timeout_seconds,
                },
            );
        }
        if self.scheduled.front().is_some_and(|s| s.due_at <= now) {
            let scheduled = self.scheduled.pop_front().expect("front event existed");
            return self.validate_and_emit_due_event(scheduled);
        }
        Ok(None)
    }

    fn next_wake(&self, now: Instant) -> Option<Duration> {
        match (
            self.scheduled
                .front()
                .map(|s| s.due_at.saturating_duration_since(now)),
            self.execution.next_wake(now),
        ) {
            (Some(event_wake), Some(timeout_wake)) => Some(event_wake.min(timeout_wake)),
            (Some(event_wake), None) => Some(event_wake),
            (None, Some(timeout_wake)) => Some(timeout_wake),
            (None, None) => None,
        }
    }
}

// ---------------------------------------------------------------------------
// RealLbeWrapper
// ---------------------------------------------------------------------------

/// Real wrapper backed by the LBE Agent Wall.
///
/// Unlike `MockLbeWrapper`, this struct does not fabricate runtime state.
/// It begins in `Disconnected` and only reports events the real wall
/// authoritatively provides. Until the wall is attached, all
/// mutation-bearing requests return errors.
///
/// This is the Milestone A (P1) read-only-attachment skeleton.
pub(crate) struct RealLbeWrapper {
    snapshot: LbeSnapshot,
    connection: RuntimeConnection,
    wall_root: Option<PathBuf>,
    target_workspace: Option<PathBuf>,
    wall_database: Option<PathBuf>,
    session_id: Option<String>,
    task_id: Option<String>,
    pending_events: VecDeque<LbeEvent>,
}

impl Default for RealLbeWrapper {
    fn default() -> Self {
        Self::new()
    }
}

impl RealLbeWrapper {
    /// Construct a real wrapper using explicit Agent Wall and target-workspace
    /// configuration. Construction never launches a process or fabricates state.
    ///
    /// If the env var is unset, the wrapper starts in `Disconnected` with no
    /// endpoint to attempt. This never fabricates mock runtime state.
    pub(crate) fn new() -> Self {
        let wall_root = std::env::var_os("LBE_WALL_ROOT").map(PathBuf::from);
        let target_workspace = std::env::var_os("LBE_TARGET_WORKSPACE").map(PathBuf::from);
        let wall_database = std::env::var_os("LBE_WALL_DATABASE").map(PathBuf::from);
        let session_id =
            std::env::var_os("LBE_SESSION_ID").map(|value| value.to_string_lossy().into_owned());
        let task_id =
            std::env::var_os("LBE_TASK_ID").map(|value| value.to_string_lossy().into_owned());
        let connection = RuntimeConnection::Disconnected;

        let mut snapshot = LbeSnapshot::default();
        snapshot.connection = connection;
        snapshot.runtime_mode = RuntimeMode::Local;
        snapshot.runtime_id = None;
        snapshot.session_id = None;
        snapshot.session_state = SessionStatus::Idle;
        snapshot.turn_id = None;
        snapshot.workspace_id = None;
        snapshot.workspace_label = String::new();
        snapshot.model_id = String::new();
        snapshot.model_family = String::new();
        snapshot.effort_label = None;
        snapshot.execution_status = None;
        snapshot.providers = Vec::new();
        snapshot.models = Vec::new();
        snapshot.selected_model = None;
        snapshot.diagnostics = Vec::new();
        snapshot.active_execution_id = None;
        snapshot.project_truth = None;
        snapshot.session_context = None;
        snapshot.provenance = None;
        snapshot.validation = None;

        Self {
            snapshot,
            connection,
            wall_root,
            target_workspace,
            wall_database,
            session_id,
            task_id,
            pending_events: VecDeque::new(),
        }
    }

    /// Attach read-only Agent Wall projections in strict order:
    ///
    /// 1. Validate LBE_WALL_ROOT.
    /// 2. Validate LBE_TARGET_WORKSPACE.
    /// 3. Export project_truth.
    /// 4. Strictly validate project_truth.
    /// 5. Obtain authoritative workspace_id and canonical workspace root.
    /// 6. Require LBE_WALL_DATABASE.
    /// 7. Require LBE_SESSION_ID.
    /// 8. Export session_context.
    /// 9. Strictly decode and validate session_context.
    /// 10. Cross-check project_truth and session_context identities.
    /// 11. Only on both successes, set connection = Connected.
    /// 12. Emit the existing attachment/snapshot events.
    ///
    /// The wrapper never leaves RealLbeWrapper Connected if either projection
    /// fails after the other succeeds.
    pub(crate) fn attach(&mut self) -> Result<(), LbeError> {
        // Step 1 — validate LBE_WALL_ROOT
        let wall_root = match self.wall_root.clone() {
            Some(value) if !value.as_os_str().is_empty() => value,
            None => {
                self.fail_closed();
                return Err(LbeError::new("LBE_WALL_ROOT is not configured"));
            }
            Some(_) => {
                self.fail_closed();
                return Err(LbeError::new("LBE_WALL_ROOT is empty"));
            }
        };
        let wall_root = match require_directory(&wall_root, "LBE_WALL_ROOT") {
            Ok(path) => path,
            Err(error) => {
                self.fail_closed();
                return Err(error);
            }
        };

        // Step 2 — validate LBE_TARGET_WORKSPACE
        let target = match self.target_workspace.clone() {
            Some(value) if !value.as_os_str().is_empty() => value,
            None => {
                self.fail_closed();
                return Err(LbeError::new("LBE_TARGET_WORKSPACE is not configured"));
            }
            Some(_) => {
                self.fail_closed();
                return Err(LbeError::new("LBE_TARGET_WORKSPACE is empty"));
            }
        };
        let target = match require_directory(&target, "LBE_TARGET_WORKSPACE") {
            Ok(path) => path,
            Err(error) => {
                self.fail_closed();
                return Err(error);
            }
        };

        // Step 3 — resolve python interpreter (LBE_WALL_PYTHON else "python")
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        // Step 4 — export project_truth
        let output = match Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "export",
                "project_truth",
                "--workspace",
            ])
            .arg(&target)
            .args(["--format", "json"])
            .output()
        {
            Ok(output) => output,
            Err(error) => {
                self.fail_closed();
                return Err(LbeError::new(format!(
                    "project_truth process launch failed: {error}"
                )));
            }
        };
        if !output.status.success() {
            self.fail_closed();
            return Err(LbeError::new(format!(
                "project_truth process exited unsuccessfully: {}",
                output.status
            )));
        }
        let stdout = match String::from_utf8(output.stdout) {
            Ok(text) => text,
            Err(_) => {
                self.fail_closed();
                return Err(LbeError::new("project_truth stdout was not UTF-8"));
            }
        };
        if stdout.trim().is_empty() {
            self.fail_closed();
            return Err(LbeError::new("project_truth stdout was empty"));
        }

        // Step 5 — decode and validate project_truth
        let project_truth: ProjectTruthProjection = match serde_json::from_str(&stdout) {
            Ok(value) => value,
            Err(error) => {
                self.fail_closed();
                return Err(LbeError::new(format!(
                    "invalid project_truth JSON: {error}"
                )));
            }
        };
        if let Err(error) = validate_project_truth(&project_truth, &target) {
            self.fail_closed();
            return Err(error);
        }

        // Step 6 — retain the project_truth workspace root. The persisted
        // session_context remains authoritative for the session workspace ID.
        let canonical_workspace_root = normalize_workspace_path(&project_truth.data.workspace_root);

        // Step 7 — require LBE_WALL_DATABASE
        let database = match self.wall_database.clone() {
            Some(value) if !value.as_os_str().is_empty() => value,
            None => {
                self.fail_closed();
                return Err(LbeError::new("LBE_WALL_DATABASE is not configured"));
            }
            Some(_) => {
                self.fail_closed();
                return Err(LbeError::new("LBE_WALL_DATABASE is empty"));
            }
        };

        // Step 8 — require LBE_SESSION_ID
        let session_id = match self.session_id.clone() {
            Some(value) if !value.trim().is_empty() => value,
            None => {
                self.fail_closed();
                return Err(LbeError::new("LBE_SESSION_ID is not configured"));
            }
            Some(_) => {
                self.fail_closed();
                return Err(LbeError::new("LBE_SESSION_ID is empty"));
            }
        };
        // Step 9 — export session_context using the authoritative workspace_id
        let sc_output = match Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "export",
                "session_context",
                "--database",
            ])
            .arg(&database)
            .args(["--session-id", &session_id])
            .args(["--format", "json"])
            .output()
        {
            Ok(output) => output,
            Err(error) => {
                self.fail_closed();
                return Err(LbeError::new(format!(
                    "session_context process launch failed: {error}"
                )));
            }
        };
        if !sc_output.status.success() {
            self.fail_closed();
            return Err(LbeError::new(format!(
                "session_context process exited unsuccessfully: {}",
                sc_output.status
            )));
        }
        let sc_stdout = match String::from_utf8(sc_output.stdout) {
            Ok(text) => text,
            Err(_) => {
                self.fail_closed();
                return Err(LbeError::new("session_context stdout was not UTF-8"));
            }
        };
        if sc_stdout.trim().is_empty() {
            self.fail_closed();
            return Err(LbeError::new("session_context stdout was empty"));
        }

        // Step 10 — decode session_context
        let session_context: SessionContextProjection = match serde_json::from_str(&sc_stdout) {
            Ok(value) => value,
            Err(error) => {
                self.fail_closed();
                let stderr = String::from_utf8_lossy(&sc_output.stderr);
                let preview = sc_stdout.trim().chars().take(512).collect::<String>();
                return Err(LbeError::new(format!(
                    "invalid session_context JSON: {error}; session_id='{}'; child_stderr='{}'; child_stdout_prefix='{}'",
                    session_id,
                    stderr.trim(),
                    preview
                )));
            }
        };

        let authoritative_workspace_id = session_context.workspace_id.clone();

        // Cross-validate identities between project_truth and session_context
        if let Err(error) = validate_session_context(
            &session_context,
            &authoritative_workspace_id,
            &canonical_workspace_root,
            &session_id,
        ) {
            self.fail_closed();
            return Err(error);
        }

        // Task-scoped projections are optional for the P1 session attachment.
        // When a task identity is configured, retain the stricter provenance
        // and validation checks used by task-scoped consumers.
        let task_id = self
            .task_id
            .clone()
            .filter(|value| !value.trim().is_empty());
        let mut provenance = None;
        let mut validation = None;

        if let Some(task_id) = task_id.as_deref() {
            // Step 11 — export provenance using authoritative identities
            let mut provenance_command = Command::new(&python);
            provenance_command
                .current_dir(&wall_root)
                .args([
                    "-m",
                    "lbe_guard_inspector.product_entry",
                    "export",
                    "provenance",
                    "--database",
                ])
                .arg(&database)
                .args(["--workspace-id", &authoritative_workspace_id])
                .args(["--session-id", &session_id]);
            provenance_command.args(["--task-id", &task_id]);
            let provenance_output = match provenance_command.args(["--format", "json"]).output() {
                Ok(output) => output,
                Err(error) => {
                    self.fail_closed();
                    return Err(LbeError::new(format!(
                        "provenance process launch failed: {error}"
                    )));
                }
            };
            if !provenance_output.status.success() {
                self.fail_closed();
                return Err(LbeError::new(format!(
                    "provenance process exited unsuccessfully: {}",
                    provenance_output.status
                )));
            }
            let provenance_stdout = match String::from_utf8(provenance_output.stdout) {
                Ok(text) => text,
                Err(_) => {
                    self.fail_closed();
                    return Err(LbeError::new("provenance stdout was not UTF-8"));
                }
            };
            if provenance_stdout.trim().is_empty() {
                self.fail_closed();
                return Err(LbeError::new("provenance stdout was empty"));
            }
            let parsed_provenance: ProvenanceProjection =
                match serde_json::from_str(&provenance_stdout) {
                    Ok(value) => value,
                    Err(error) => {
                        self.fail_closed();
                        return Err(LbeError::new(format!("invalid provenance JSON: {error}")));
                    }
                };
            if let Err(error) = validate_provenance(
                &parsed_provenance,
                &authoritative_workspace_id,
                &session_context.session_id,
            ) {
                self.fail_closed();
                return Err(error);
            }

            // Step 12 — export validation using only authoritative identities
            let validation_output = match Command::new(&python)
                .current_dir(&wall_root)
                .args([
                    "-m",
                    "lbe_guard_inspector.product_entry",
                    "export",
                    "validation",
                    "--database",
                ])
                .arg(&database)
                .args(["--session-id", &session_context.session_id])
                .args(["--task-id", &task_id])
                .args(["--format", "json"])
                .output()
            {
                Ok(output) => output,
                Err(error) => {
                    self.fail_closed();
                    return Err(LbeError::new(format!(
                        "validation process launch failed: {error}"
                    )));
                }
            };
            if !validation_output.status.success() {
                self.fail_closed();
                return Err(LbeError::new(format!(
                    "validation process exited unsuccessfully: {}",
                    validation_output.status
                )));
            }
            let validation_stdout = match String::from_utf8(validation_output.stdout) {
                Ok(text) => text,
                Err(_) => {
                    self.fail_closed();
                    return Err(LbeError::new("validation stdout was not UTF-8"));
                }
            };
            if validation_stdout.trim().is_empty() {
                self.fail_closed();
                return Err(LbeError::new("validation stdout was empty"));
            }
            let parsed_validation: ValidationProjection =
                match serde_json::from_str(&validation_stdout) {
                    Ok(value) => value,
                    Err(error) => {
                        self.fail_closed();
                        return Err(LbeError::new(format!("invalid validation JSON: {error}")));
                    }
                };
            if let Err(error) = validate_validation(
                &parsed_validation,
                &authoritative_workspace_id,
                &session_context.session_id,
                &task_id,
                parsed_provenance.data.task_id.as_deref(),
            ) {
                self.fail_closed();
                return Err(error);
            }
            provenance = Some(parsed_provenance);
            validation = Some(parsed_validation);
        }

        // Step 13 — apply snapshot fields; all required projections passed
        self.snapshot.project_truth = Some(project_truth);
        self.snapshot.session_context = Some(session_context.clone());
        self.snapshot.provenance = provenance;
        self.snapshot.validation = validation;
        self.snapshot.session_id = Some(session_context.session_id.clone());
        self.snapshot.workspace_id = Some(authoritative_workspace_id);
        self.snapshot.workspace_label =
            normalize_workspace_path(&session_context.data.workspace.canonical_root);
        self.snapshot.runtime_mode = RuntimeMode::Local;
        self.snapshot.connection = RuntimeConnection::Connected;
        self.connection = RuntimeConnection::Connected;

        // Step 13 — emit attachment and snapshot events
        self.pending_events
            .push_back(LbeEvent::RuntimeAttachmentUpdated {
                connection: RuntimeConnection::Connected,
                runtime_id: None,
                runtime_mode: RuntimeMode::Local,
                attached_client_count: 1,
            });
        self.pending_events.push_back(LbeEvent::SnapshotUpdated {
            snapshot: self.snapshot.clone(),
        });

        Ok(())
    }

    /// Detach this client from the real Agent Wall without changing any
    /// persisted Wall state. Historical projections remain available for
    /// display, but the snapshot is explicitly no longer live-connected.
    pub(crate) fn disconnect(&mut self) {
        self.connection = RuntimeConnection::Disconnected;
        self.snapshot.connection = RuntimeConnection::Disconnected;
        self.snapshot.runtime_id = None;
        self.snapshot.turn_id = None;
        self.pending_events
            .push_back(LbeEvent::RuntimeAttachmentUpdated {
                connection: RuntimeConnection::Disconnected,
                runtime_id: None,
                runtime_mode: RuntimeMode::Local,
                attached_client_count: 0,
            });
        self.pending_events.push_back(LbeEvent::SnapshotUpdated {
            snapshot: self.snapshot.clone(),
        });
    }

    /// Re-read all four authoritative projections using an isolated
    /// candidate wrapper. The current snapshot is not replaced unless the
    /// candidate completes the full attach chain successfully.
    pub(crate) fn reconnect(&mut self) -> Result<(), LbeError> {
        self.connection = RuntimeConnection::Reconnecting;
        self.snapshot.connection = RuntimeConnection::Reconnecting;
        self.snapshot.runtime_id = None;
        self.snapshot.turn_id = None;
        self.pending_events
            .push_back(LbeEvent::RuntimeAttachmentUpdated {
                connection: RuntimeConnection::Reconnecting,
                runtime_id: None,
                runtime_mode: RuntimeMode::Local,
                attached_client_count: 0,
            });

        let mut candidate = Self::new();
        if let Err(error) = candidate.attach() {
            self.connection = RuntimeConnection::Lost;
            self.snapshot.connection = RuntimeConnection::Lost;
            self.snapshot.runtime_id = None;
            self.snapshot.turn_id = None;
            self.pending_events
                .push_back(LbeEvent::RuntimeAttachmentUpdated {
                    connection: RuntimeConnection::Lost,
                    runtime_id: None,
                    runtime_mode: RuntimeMode::Local,
                    attached_client_count: 0,
                });
            return Err(error);
        }

        self.snapshot = candidate.snapshot;
        self.connection = candidate.connection;
        self.pending_events.extend(candidate.pending_events);
        Ok(())
    }

    fn fail_closed(&mut self) {
        self.connection = RuntimeConnection::Disconnected;
        self.snapshot.connection = RuntimeConnection::Disconnected;
        self.snapshot.project_truth = None;
        self.snapshot.session_context = None;
        self.snapshot.provenance = None;
        self.snapshot.validation = None;
    }

    /// Returns the current connection state.
    pub(crate) fn connection_state(&self) -> RuntimeConnection {
        self.connection
    }

    /// Returns `Err` if the runtime is not connected to the real wall.
    fn require_connected(&self) -> Result<(), LbeError> {
        if self.connection == RuntimeConnection::Connected {
            Ok(())
        } else {
            Err(LbeError::new(format!(
                "operation requires a connected LBE runtime; current state: {}",
                self.connection.label()
            )))
        }
    }

    fn inspect_workspace(&mut self, path: &str) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let session_id = self
            .session_id
            .clone()
            .or_else(|| self.snapshot.session_id.clone())
            .ok_or_else(|| LbeError::new("LBE_SESSION_ID is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let workspace = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;

        let operation_id = format!(
            "tui.workspace.read:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "workspace.read".to_owned(),
            input_summary: path.to_owned(),
            risk: ToolRisk::ReadOnly,
        });
        self.pending_events.push_back(LbeEvent::ToolStarted {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
        });

        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                "workspace.read",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--workspace-id",
                &workspace_id,
                "--workspace",
            ])
            .arg(workspace)
            .args([
                "--path",
                path,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!("workspace.read process launch failed: {error}"))
            })?;

        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("workspace.read stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid workspace.read JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.read")
        {
            return Err(LbeError::new("workspace.read response identity mismatch"));
        }

        let receipt_id = payload
            .get("receipt_id")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned);
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id,
                tool_call_id,
                evidence_ref,
            });
            if let Some(receipt_id) = receipt_id {
                self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                    execution_id: format!("exec_{operation_id}"),
                    receipt_id: Some(receipt_id),
                });
            }
            Ok(())
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("workspace.read was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
            Ok(())
        }
    }

    fn list_workspace(&mut self, path: &str) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let session_id = self
            .session_id
            .clone()
            .or_else(|| self.snapshot.session_id.clone())
            .ok_or_else(|| LbeError::new("LBE_SESSION_ID is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let workspace = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;
        let operation_id = format!(
            "tui.workspace.list:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "workspace.list".to_owned(),
            input_summary: path.to_owned(),
            risk: ToolRisk::ReadOnly,
        });
        self.pending_events.push_back(LbeEvent::ToolStarted {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
        });

        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                "workspace.list",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--workspace-id",
                &workspace_id,
                "--workspace",
            ])
            .arg(workspace)
            .args([
                "--path",
                path,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!("workspace.list process launch failed: {error}"))
            })?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("workspace.list stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid workspace.list JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.list")
        {
            return Err(LbeError::new("workspace.list response identity mismatch"));
        }
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = payload
                .get("receipt_id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            if let Some(receipt_id) = receipt_id {
                self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                    execution_id,
                    receipt_id: Some(receipt_id),
                });
            }
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("workspace.list was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
        }
        Ok(())
    }

    fn glob_workspace(&mut self, pattern: &str) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let session_id = self
            .session_id
            .clone()
            .or_else(|| self.snapshot.session_id.clone())
            .ok_or_else(|| LbeError::new("LBE_SESSION_ID is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let workspace = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;
        let operation_id = format!(
            "tui.workspace.glob:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "workspace.glob".to_owned(),
            input_summary: pattern.to_owned(),
            risk: ToolRisk::ReadOnly,
        });
        self.pending_events.push_back(LbeEvent::ToolStarted {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
        });

        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                "workspace.glob",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--workspace-id",
                &workspace_id,
                "--workspace",
            ])
            .arg(workspace)
            .args([
                "--path",
                pattern,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!("workspace.glob process launch failed: {error}"))
            })?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("workspace.glob stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid workspace.glob JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.glob")
        {
            return Err(LbeError::new("workspace.glob response identity mismatch"));
        }
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = payload
                .get("receipt_id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            if let Some(receipt_id) = receipt_id {
                self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                    execution_id,
                    receipt_id: Some(receipt_id),
                });
            }
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("workspace.glob was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
        }
        Ok(())
    }

    fn search_workspace(&mut self, query: &str) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let session_id = self
            .session_id
            .clone()
            .or_else(|| self.snapshot.session_id.clone())
            .ok_or_else(|| LbeError::new("LBE_SESSION_ID is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let workspace = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;
        let operation_id = format!(
            "tui.workspace.search:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "workspace.search".to_owned(),
            input_summary: query.to_owned(),
            risk: ToolRisk::ReadOnly,
        });
        self.pending_events.push_back(LbeEvent::ToolStarted {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
        });

        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                "workspace.search",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--workspace-id",
                &workspace_id,
                "--workspace",
            ])
            .arg(workspace)
            .args([
                "--path",
                query,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!("workspace.search process launch failed: {error}"))
            })?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("workspace.search stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid workspace.search JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str)
                != Some("workspace.search")
        {
            return Err(LbeError::new("workspace.search response identity mismatch"));
        }
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = payload
                .get("receipt_id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            if let Some(receipt_id) = receipt_id {
                self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                    execution_id,
                    receipt_id: Some(receipt_id),
                });
            }
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("workspace.search was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
        }
        Ok(())
    }

    fn patch_workspace(
        &mut self,
        path: &str,
        content: &str,
        expected_sha256: &str,
    ) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let session_id = self
            .session_id
            .clone()
            .or_else(|| self.snapshot.session_id.clone())
            .ok_or_else(|| LbeError::new("LBE_SESSION_ID is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let workspace = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;
        let operation_id = format!(
            "tui.workspace.patch:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));

        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "workspace.patch".to_owned(),
            input_summary: path.to_owned(),
            risk: ToolRisk::Governed,
        });
        self.pending_events.push_back(LbeEvent::ToolStarted {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
        });

        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                "workspace.patch",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--workspace-id",
                &workspace_id,
                "--workspace",
            ])
            .arg(workspace)
            .args(["--path", path, "--content"])
            .arg(content)
            .args([
                "--expected-sha256",
                expected_sha256,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!("workspace.patch process launch failed: {error}"))
            })?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("workspace.patch stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid workspace.patch JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.patch")
        {
            return Err(LbeError::new("workspace.patch response identity mismatch"));
        }
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = payload
                .get("receipt_id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            if let Some(receipt_id) = receipt_id {
                self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                    execution_id,
                    receipt_id: Some(receipt_id),
                });
            }
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("workspace.patch was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
        }
        Ok(())
    }
}

fn next_real_operation_ordinal() -> u64 {
    static NEXT_REAL_OPERATION: AtomicU64 = AtomicU64::new(1);
    NEXT_REAL_OPERATION.fetch_add(1, Ordering::Relaxed)
}
impl LbeWrapper for RealLbeWrapper {
    fn snapshot(&self) -> LbeSnapshot {
        self.snapshot.clone()
    }

    fn submit(&mut self, request: UserRequest, _now: Instant) -> Result<(), LbeError> {
        match request {
            UserRequest::RefreshRuntimeSnapshot => {
                self.require_connected()?;
                self.attach()
            }
            UserRequest::InspectWorkspace { path } => self.inspect_workspace(&path),
            UserRequest::ListWorkspace { path } => self.list_workspace(&path),
            UserRequest::GlobWorkspace { pattern } => self.glob_workspace(&pattern),
            UserRequest::SearchWorkspace { query } => self.search_workspace(&query),
            UserRequest::PatchWorkspace {
                path,
                content,
                expected_sha256,
            } => self.patch_workspace(&path, &content, &expected_sha256),
            _ => self.require_connected(),
        }
    }

    fn poll_event(&mut self, _now: Instant) -> Result<Option<LbeEvent>, LbeError> {
        Ok(self.pending_events.pop_front())
    }

    fn next_wake(&self, _now: Instant) -> Option<Duration> {
        None
    }
}

fn require_directory(path: &Path, name: &str) -> Result<PathBuf, LbeError> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|_| LbeError::new(format!("{name} is unavailable: {}", path.display())))?;
    if !canonical.is_dir() {
        return Err(LbeError::new(format!(
            "{name} is not a directory: {}",
            path.display()
        )));
    }
    Ok(canonical)
}

fn normalize_workspace_path(value: &str) -> String {
    let mut normalized = value.replace('\\', "/");
    if let Some(stripped) = normalized.strip_prefix("//?/") {
        normalized = stripped.to_owned();
    }
    normalized.trim_end_matches('/').to_owned()
}

fn validate_project_truth(
    projection: &ProjectTruthProjection,
    target: &Path,
) -> Result<(), LbeError> {
    if projection.schema_version != "1.0" {
        return Err(LbeError::new("project_truth schema_version must be 1.0"));
    }
    if projection.projection_type != "project_truth" {
        return Err(LbeError::new("project_truth projection_type is invalid"));
    }
    if !projection.read_only {
        return Err(LbeError::new("project_truth projection is not read-only"));
    }
    if projection.workspace_id.trim().is_empty() {
        return Err(LbeError::new("project_truth workspace_id is missing"));
    }
    if projection.data.workspace_root.trim().is_empty()
        || projection.data.target_project_root.trim().is_empty()
        || projection.data.profile_hash.trim().is_empty()
        || !is_hex_64(&projection.data.profile_hash)
    {
        return Err(LbeError::new("project_truth required data is invalid"));
    }
    let target = std::fs::canonicalize(target)
        .map_err(|_| LbeError::new("target workspace is unavailable"))?;
    for (name, value) in [
        ("workspace_root", &projection.data.workspace_root),
        ("target_project_root", &projection.data.target_project_root),
    ] {
        let root = std::fs::canonicalize(value)
            .map_err(|_| LbeError::new(format!("project_truth {name} is unavailable")))?;
        if root != target {
            return Err(LbeError::new(format!(
                "project_truth {name} does not match target workspace"
            )));
        }
    }
    for signal in &projection.data.signals {
        if signal.path.trim().is_empty()
            || !is_hex_64(&signal.sha256)
            || signal.project_type.trim().is_empty()
            || signal.pack.trim().is_empty()
        {
            return Err(LbeError::new("project_truth signal data is invalid"));
        }
    }
    Ok(())
}

fn is_hex_64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Strict validation for a session_context projection.
///
/// Performs all structural and cross-identity checks required by the
/// REAL_AGENT_WALL_SESSION_CONTEXT_ATTACHMENT_V1 specification.
///
/// Fails closed on any mismatch.
pub(crate) fn validate_session_context(
    projection: &SessionContextProjection,
    authoritative_workspace_id: &str,
    canonical_workspace_root: &str,
    configured_session_id: &str,
) -> Result<(), LbeError> {
    // Top-level structural checks
    if projection.schema_version != "1.0" {
        return Err(LbeError::new("session_context schema_version must be 1.0"));
    }
    if projection.projection_type != "session_context" {
        return Err(LbeError::new(
            "session_context projection_type must be session_context",
        ));
    }
    if !projection.read_only {
        return Err(LbeError::new("session_context projection is not read-only"));
    }
    if projection.workspace_id.trim().is_empty() {
        return Err(LbeError::new("session_context workspace_id is empty"));
    }
    if projection.session_id.trim().is_empty() {
        return Err(LbeError::new("session_context session_id is empty"));
    }

    // Session identity checks
    let session = &projection.data.session;
    if session.session_id.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.session.session_id is empty",
        ));
    }
    if session.project_workspace_id.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.session.project_workspace_id is empty",
        ));
    }
    if session.canonical_workspace_root.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.session.canonical_workspace_root is empty",
        ));
    }
    if session.mode.trim().is_empty() {
        return Err(LbeError::new("session_context data.session.mode is empty"));
    }
    if session.created_at.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.session.created_at is empty",
        ));
    }
    if session.updated_at.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.session.updated_at is empty",
        ));
    }

    // Workspace checks
    let workspace = &projection.data.workspace;
    if workspace.project_workspace_id.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.workspace.project_workspace_id is empty",
        ));
    }
    if workspace.canonical_root.trim().is_empty() {
        return Err(LbeError::new(
            "session_context data.workspace.canonical_root is empty",
        ));
    }

    // Opaque owner payload validation for task, checkpoint, checkpoint_revalidation
    for (name, opt) in [
        ("task", &projection.data.task),
        ("checkpoint", &projection.data.checkpoint),
        (
            "checkpoint_revalidation",
            &projection.data.checkpoint_revalidation,
        ),
    ] {
        if let Some(payload) = opt {
            validate_opaque_payload(payload, name)?;
        }
    }

    // Opaque owner payload validation for verified_facts
    for (i, payload) in projection.data.verified_facts.iter().enumerate() {
        validate_opaque_payload(payload, &format!("verified_facts[{i}]"))?;
    }

    // Opaque owner payload validation for active_constraints
    for (i, payload) in projection.data.active_constraints.iter().enumerate() {
        validate_opaque_payload(payload, &format!("active_constraints[{i}]"))?;
    }

    // Opaque owner payload validation for recent_failures
    for (i, payload) in projection.data.recent_failures.iter().enumerate() {
        validate_opaque_payload(payload, &format!("recent_failures[{i}]"))?;
    }

    // Transcript item validation
    for (i, item) in projection.data.transcript.iter().enumerate() {
        if item.kind.trim().is_empty() {
            return Err(LbeError::new(format!(
                "session_context transcript[{i}].kind is empty",
            )));
        }
        if item.status.trim().is_empty() {
            return Err(LbeError::new(format!(
                "session_context transcript[{i}].status is empty",
            )));
        }
        if item.event_id.trim().is_empty() {
            return Err(LbeError::new(format!(
                "session_context transcript[{i}].event_id is empty",
            )));
        }
    }

    // Cross-identity validation
    if &projection.workspace_id != authoritative_workspace_id {
        return Err(LbeError::new(format!(
            "session_context workspace_id '{}' does not match authoritative project_truth workspace_id '{}'",
            projection.workspace_id, authoritative_workspace_id
        )));
    }
    if &session.project_workspace_id != &projection.workspace_id {
        return Err(LbeError::new(format!(
            "session_context data.session.project_workspace_id '{}' does not match session_context workspace_id '{}'",
            session.project_workspace_id, projection.workspace_id
        )));
    }
    if &workspace.project_workspace_id != &projection.workspace_id {
        return Err(LbeError::new(format!(
            "session_context data.workspace.project_workspace_id '{}' does not match session_context workspace_id '{}'",
            workspace.project_workspace_id, projection.workspace_id
        )));
    }
    if &projection.session_id != configured_session_id {
        return Err(LbeError::new(format!(
            "session_context session_id '{}' does not match configured LBE_SESSION_ID '{}'",
            projection.session_id, configured_session_id
        )));
    }
    if &session.session_id != &projection.session_id {
        return Err(LbeError::new(format!(
            "session_context data.session.session_id '{}' does not match session_context session_id '{}'",
            session.session_id, projection.session_id
        )));
    }
    if normalize_workspace_path(&session.canonical_workspace_root)
        != normalize_workspace_path(&workspace.canonical_root)
    {
        return Err(LbeError::new(format!(
            "session_context data.session.canonical_workspace_root '{}' does not match data.workspace.canonical_root '{}'",
            session.canonical_workspace_root, workspace.canonical_root
        )));
    }
    if normalize_workspace_path(&workspace.canonical_root)
        != normalize_workspace_path(canonical_workspace_root)
    {
        return Err(LbeError::new(format!(
            "session_context data.workspace.canonical_root '{}' does not match project_truth data.workspace_root '{}'",
            workspace.canonical_root, canonical_workspace_root
        )));
    }

    Ok(())
}

/// Validate that an opaque owner payload has the required wrapper structure.
///
/// The `payload` field is kept as opaque `serde_json::Value`; this function
/// enforces only the wrapper invariants, not the contents of the payload.
fn validate_opaque_payload(payload: &OpaqueOwnerPayload, name: &str) -> Result<(), LbeError> {
    if payload.owner_payload_version != "1.0" {
        return Err(LbeError::new(format!(
            "session_context {name} owner_payload_version must be 1.0",
        )));
    }
    if !payload.opaque {
        return Err(LbeError::new(format!(
            "session_context {name} must be opaque (opaque=true)",
        )));
    }
    Ok(())
}

pub(crate) fn validate_provenance(
    projection: &ProvenanceProjection,
    authoritative_workspace_id: &str,
    authoritative_session_id: &str,
) -> Result<(), LbeError> {
    if projection.schema_version != "1.0" {
        return Err(LbeError::new("provenance schema_version must be 1.0"));
    }
    if projection.projection_type != "provenance" {
        return Err(LbeError::new("provenance projection_type is invalid"));
    }
    if !projection.read_only {
        return Err(LbeError::new("provenance projection is not read-only"));
    }
    if projection.workspace_id.trim().is_empty() {
        return Err(LbeError::new("provenance workspace_id is missing"));
    }
    if projection.workspace_id != authoritative_workspace_id {
        return Err(LbeError::new(
            "provenance workspace_id does not match project_truth",
        ));
    }
    if projection.session_id.as_deref() != Some(authoritative_session_id) {
        return Err(LbeError::new(
            "provenance session_id does not match session_context",
        ));
    }
    if projection.data.session_id.as_deref() != Some(authoritative_session_id) {
        return Err(LbeError::new(
            "provenance data.session_id does not match session_context",
        ));
    }
    if projection.session_id != projection.data.session_id {
        return Err(LbeError::new(
            "provenance top-level and data session_id disagree",
        ));
    }
    for (i, source) in projection.data.sources.iter().enumerate() {
        validate_opaque_payload(source, &format!("provenance sources[{i}]"))?;
    }
    for (i, event) in projection.data.events.iter().enumerate() {
        if event.event_id.trim().is_empty() {
            return Err(LbeError::new(format!(
                "provenance events[{i}].event_id is empty"
            )));
        }
        if event.event_type.trim().is_empty() {
            return Err(LbeError::new(format!(
                "provenance events[{i}].event_type is empty"
            )));
        }
        if event.turn_id.trim().is_empty() {
            return Err(LbeError::new(format!(
                "provenance events[{i}].turn_id is empty"
            )));
        }
    }
    Ok(())
}

pub(crate) fn validate_validation(
    projection: &ValidationProjection,
    authoritative_workspace_id: &str,
    authoritative_session_id: &str,
    configured_task_id: &str,
    provenance_task_id: Option<&str>,
) -> Result<(), LbeError> {
    if projection.schema_version != "1.0" {
        return Err(LbeError::new("validation schema_version must be 1.0"));
    }
    if projection.projection_type != "validation" {
        return Err(LbeError::new("validation projection_type is invalid"));
    }
    if !projection.read_only {
        return Err(LbeError::new("validation projection is not read-only"));
    }
    if projection.workspace_id.trim().is_empty()
        || projection.workspace_id != authoritative_workspace_id
    {
        return Err(LbeError::new(
            "validation workspace_id does not match project_truth",
        ));
    }
    if projection.session_id.trim().is_empty() || projection.session_id != authoritative_session_id
    {
        return Err(LbeError::new(
            "validation session_id does not match session_context",
        ));
    }
    if configured_task_id.trim().is_empty() || projection.data.task_id.trim().is_empty() {
        return Err(LbeError::new("validation task_id is missing"));
    }
    if projection.data.task_id != configured_task_id {
        return Err(LbeError::new(
            "validation task_id does not match configured LBE_TASK_ID",
        ));
    }
    if let Some(provenance_task_id) = provenance_task_id {
        if provenance_task_id != configured_task_id {
            return Err(LbeError::new(
                "provenance task_id does not match configured LBE_TASK_ID",
            ));
        }
    }
    if projection.data.operation_id.trim().is_empty() {
        return Err(LbeError::new("validation operation_id is empty"));
    }
    for (i, requirement) in projection.data.requirements.iter().enumerate() {
        if requirement.requirement_id.trim().is_empty()
            || requirement.evidence_kind.trim().is_empty()
        {
            return Err(LbeError::new(format!(
                "validation requirements[{i}] is malformed"
            )));
        }
    }
    for (i, policy) in projection.data.policies.iter().enumerate() {
        if policy.policy_id.trim().is_empty()
            || policy.operation_id.trim().is_empty()
            || policy.evidence_kind.trim().is_empty()
            || policy.command.is_empty()
            || policy.command.iter().any(|part| part.trim().is_empty())
            || !positive_json_number(&policy.timeout_seconds)
        {
            return Err(LbeError::new(format!(
                "validation policies[{i}] is malformed"
            )));
        }
    }
    for (i, evidence) in projection.data.evidence.iter().enumerate() {
        if evidence.evidence_id.trim().is_empty()
            || evidence.kind.trim().is_empty()
            || evidence.producer_id.trim().is_empty()
            || evidence.operation_id.trim().is_empty()
            || evidence.details.owner_payload_version != "1.0"
            || !evidence.details.opaque
        {
            return Err(LbeError::new(format!(
                "validation evidence[{i}] is malformed"
            )));
        }
    }
    Ok(())
}

fn positive_json_number(number: &serde_json::Number) -> bool {
    number.as_u64().is_some_and(|value| value > 0)
        || number
            .as_f64()
            .is_some_and(|value| value.is_finite() && value > 0.0)
}
