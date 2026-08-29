use std::{
    collections::{HashMap, VecDeque},
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
        }
    }
}

impl ExecutionStateMachine {
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
            LbeEvent::ToolStarted { tool_call_id } => {
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
    execution: ExecutionStateMachine,
}

impl MockLbeWrapper {
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
            self.execution.mark_terminal_emitted();
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
            && self.execution.terminal_already_emitted()
            && matches!(
                scheduled.event,
                LbeEvent::ExecutionRejected
                    | LbeEvent::TimedOut { .. }
                    | LbeEvent::LbeCompletionAccepted { .. }
            )
        {
            return Ok(Some(scheduled.event));
        }
        match self.execution.apply_event(&scheduled.event) {
            Ok(Some(status)) => {
                self.set_execution_status(status);
                if status.is_terminal() {
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
                self.scheduled.clear();
                if !self.execution.status.is_terminal() {
                    self.execution
                        .transition_terminal(ExecutionStatus::Failed)?;
                    self.set_execution_status(ExecutionStatus::Failed);
                    self.execution.mark_terminal_emitted();
                    self.emit_execution_status();
                }
                Ok(Some(LbeEvent::ToolFailed {
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
}

impl Default for MockLbeWrapper {
    fn default() -> Self {
        Self {
            snapshot: LbeSnapshot::default(),
            scheduled: VecDeque::new(),
            pending_approval_id: None,
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
                    self.execution.begin_approval()?;
                    let approval_id = "apr_mock_7f31".to_owned();
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
                        tool_call_id: ids.tool_call_id.clone(),
                        tool_name: "workspace.inspect".to_owned(),
                        input_summary: "active workspace".to_owned(),
                        risk: ToolRisk::ReadOnly,
                    },
                );
                self.schedule(
                    now + Duration::from_millis(350),
                    LbeEvent::ToolStarted {
                        tool_call_id: ids.tool_call_id.clone(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(400),
                    LbeEvent::CommandStarted {
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        command_summary: "cargo check (mock only)".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(450),
                    LbeEvent::CommandStdoutDelta {
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        text: "Checking mock workspace...".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(500),
                    LbeEvent::CommandStderrDelta {
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        text: "mock stderr is display-only".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(550),
                    LbeEvent::CommandCompleted {
                        tool_call_id: ids.tool_call_id.clone(),
                        command_id: ids.command_id.clone(),
                        exit_code: 0,
                    },
                );
                self.schedule(
                    now + Duration::from_millis(600),
                    LbeEvent::ToolOutputDelta {
                        tool_call_id: ids.tool_call_id.clone(),
                        text: "Mock workspace inspection completed.".to_owned(),
                    },
                );
                self.schedule(
                    now + Duration::from_millis(650),
                    LbeEvent::ToolCompleted {
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
                self.terminalize(ExecutionStatus::Rejected, LbeEvent::ExecutionRejected);
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
                self.terminalize(ExecutionStatus::Aborted, LbeEvent::ExecutionRejected);
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
