use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread,
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

enum WorkerMessage {
    Event(LbeEvent),
    Error(LbeError),
}

enum WorkerCommand {
    Request(UserRequest),
    Shutdown,
}

/// UI-side proxy for the runtime wrapper.
///
/// The worker owns the real wrapper, so filesystem, Python, and runtime calls
/// cannot block terminal input or rendering. The proxy deliberately keeps the
/// existing `LbeWrapper` contract so the App state machine remains testable.
pub(crate) struct WrapperClient {
    requests: Sender<WorkerCommand>,
    messages: Receiver<WorkerMessage>,
    snapshot: LbeSnapshot,
    worker: Option<thread::JoinHandle<()>>,
}

impl WrapperClient {
    pub(crate) fn spawn(use_real_runtime: bool) -> Self {
        let (request_tx, request_rx) = mpsc::channel();
        let (message_tx, message_rx) = mpsc::channel();
        let initial_snapshot = if use_real_runtime {
            RealLbeWrapper::default().snapshot()
        } else {
            LbeSnapshot::default()
        };

        let worker = thread::spawn(move || {
            let mut wrapper: Box<dyn LbeWrapper> = if use_real_runtime {
                let mut real = RealLbeWrapper::default();
                if let Err(error) = real.attach() {
                    let _ = message_tx.send(WorkerMessage::Error(error));
                }
                Box::new(real)
            } else {
                Box::new(MockLbeWrapper::default())
            };
            let _ = message_tx.send(WorkerMessage::Event(LbeEvent::SnapshotUpdated {
                snapshot: wrapper.snapshot(),
            }));

            loop {
                let now = Instant::now();
                while let Ok(command) = request_rx.try_recv() {
                    match command {
                        WorkerCommand::Request(request) => {
                            if let Err(error) = wrapper.submit(request, Instant::now()) {
                                let _ = message_tx.send(WorkerMessage::Error(error));
                            }
                        }
                        WorkerCommand::Shutdown => return,
                    }
                }

                loop {
                    match wrapper.poll_event(now) {
                        Ok(Some(event)) => {
                            if message_tx.send(WorkerMessage::Event(event)).is_err() {
                                return;
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            let _ = message_tx.send(WorkerMessage::Error(error));
                            break;
                        }
                    }
                }

                let wait = wrapper
                    .next_wake(Instant::now())
                    .unwrap_or(Duration::from_millis(25))
                    .min(Duration::from_millis(25));
                match request_rx.recv_timeout(wait) {
                    Ok(WorkerCommand::Request(request)) => {
                        if let Err(error) = wrapper.submit(request, Instant::now()) {
                            let _ = message_tx.send(WorkerMessage::Error(error));
                        }
                    }
                    Ok(WorkerCommand::Shutdown) => return,
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
        });

        Self {
            requests: request_tx,
            messages: message_rx,
            snapshot: initial_snapshot,
            worker: Some(worker),
        }
    }

    pub(crate) fn shutdown(mut self) {
        let _ = self.requests.send(WorkerCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for WrapperClient {
    fn drop(&mut self) {
        let _ = self.requests.send(WorkerCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl LbeWrapper for WrapperClient {
    fn snapshot(&self) -> LbeSnapshot {
        self.snapshot.clone()
    }

    fn submit(&mut self, request: UserRequest, _now: Instant) -> Result<(), LbeError> {
        self.requests
            .send(WorkerCommand::Request(request))
            .map_err(|_| LbeError::new("LBE worker stopped"))
    }

    fn poll_event(&mut self, _now: Instant) -> Result<Option<LbeEvent>, LbeError> {
        match self.messages.try_recv() {
            Ok(WorkerMessage::Event(event)) => {
                if let LbeEvent::SnapshotUpdated { snapshot } = &event {
                    self.snapshot = snapshot.clone();
                }
                Ok(Some(event))
            }
            Ok(WorkerMessage::Error(error)) => Ok(Some(LbeEvent::WrapperError {
                message: error.message,
            })),
            Err(mpsc::TryRecvError::Empty) => Ok(None),
            Err(mpsc::TryRecvError::Disconnected) => Err(LbeError::new("LBE worker stopped")),
        }
    }

    fn next_wake(&self, _now: Instant) -> Option<Duration> {
        Some(Duration::from_millis(16))
    }
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
    next_session_ordinal: u64,
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
            next_session_ordinal: 1,
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
            UserRequest::StartSession => {
                let parent_session_id = self.snapshot.session_id.clone();
                self.next_session_ordinal += 1;
                let session_id = format!("sess_mock_{:04}", self.next_session_ordinal);
                self.pending_approval_id = None;
                self.scheduled.clear();
                self.execution = ExecutionStateMachine::default();
                self.snapshot.lineage = SessionLineage {
                    root_session_id: session_id.clone(),
                    parent_session_id,
                    origin: SessionOrigin::User,
                };
                self.snapshot.session_id = Some(session_id.clone());
                self.snapshot.session_state = SessionStatus::Idle;
                self.snapshot.sessions.push(SessionSummary {
                    session_id: session_id.clone(),
                    status: SessionStatus::Idle,
                    origin: SessionOrigin::User,
                    parent_session_id: self.snapshot.lineage.parent_session_id.clone(),
                });
                self.snapshot.turn_id = Some("turn_mock_0".to_owned());
                self.snapshot.active_execution_id = None;
                self.snapshot.execution_status = None;
                self.emit(LbeEvent::SessionStarted { session_id });
                self.emit_snapshot();
            }
            UserRequest::ListSessions => {
                self.emit(LbeEvent::SessionListUpdated {
                    sessions: self.snapshot.sessions.clone(),
                });
            }
            UserRequest::ResumeSession { session_id } => {
                let summary = self
                    .snapshot
                    .sessions
                    .iter()
                    .find(|session| session.session_id == session_id)
                    .cloned()
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "session {session_id} is not known to the mock runtime"
                        ))
                    })?;
                self.snapshot.session_id = Some(summary.session_id.clone());
                self.snapshot.session_state = summary.status;
                self.snapshot.lineage = SessionLineage {
                    root_session_id: summary.session_id.clone(),
                    parent_session_id: summary.parent_session_id,
                    origin: summary.origin,
                };
                self.snapshot.turn_id = Some("turn_mock_0".to_owned());
                self.snapshot.active_execution_id = None;
                self.snapshot.execution_status = None;
                self.emit(LbeEvent::SessionRestored { session_id });
                self.emit_snapshot();
            }
            UserRequest::CloseSession { session_id } => {
                if self.snapshot.session_id.as_deref() == Some(session_id.as_str()) {
                    return Err(LbeError::new(
                        "active session cannot be closed without a replacement session",
                    ));
                }
                let index = self
                    .snapshot
                    .sessions
                    .iter()
                    .position(|session| session.session_id == session_id)
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "session {session_id} is not known to the mock runtime"
                        ))
                    })?;
                self.snapshot.sessions.remove(index);
                self.emit(LbeEvent::SessionClosed { session_id });
                self.emit(LbeEvent::SessionListUpdated {
                    sessions: self.snapshot.sessions.clone(),
                });
            }
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
            UserRequest::RefreshMcpRegistry => {
                self.emit(LbeEvent::McpRegistryUpdated {
                    schema_version: 1,
                    integrations: Vec::new(),
                });
            }
            UserRequest::QueryBirdEye { .. } => {
                return Err(LbeError::new(
                    "governed BirdEye MCP execution is unavailable in mock mode",
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
            UserRequest::RunRegisteredProcess { .. } => {
                return Err(LbeError::new(
                    "governed registered-process execution is unavailable in mock mode",
                ));
            }
            UserRequest::RequestAuthorization { .. } => {
                return Err(LbeError::new(
                    "governed authorization projection is unavailable in mock mode",
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
            UserRequest::ConfigureProvider {
                provider_id,
                base_url,
                credential_ref,
            } => {
                if base_url.as_deref().is_some_and(str::is_empty)
                    || credential_ref.as_deref().is_some_and(str::is_empty)
                {
                    return Err(LbeError::new(
                        "provider configuration values must not be blank",
                    ));
                }
                let provider = self
                    .snapshot
                    .providers
                    .iter_mut()
                    .find(|provider| provider.provider_id == provider_id)
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "provider {} is not in the mock catalog",
                            provider_id.label()
                        ))
                    })?;
                provider.auth_state = AuthState::Configured;
                provider.health = ProviderHealth::Unknown;
                self.emit(LbeEvent::ProviderCatalogDiscovered {
                    providers: self.snapshot.providers.clone(),
                });
            }
            UserRequest::ValidateProvider { provider_id } => {
                let provider_index = self
                    .snapshot
                    .providers
                    .iter()
                    .position(|provider| provider.provider_id == provider_id)
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "provider {} is not in the mock catalog",
                            provider_id.label()
                        ))
                    })?;
                self.snapshot.providers[provider_index].auth_state = AuthState::Validating;
                self.snapshot.providers[provider_index].health = ProviderHealth::Unknown;
                self.emit(LbeEvent::ProviderValidationStarted { provider_id });
                self.snapshot.providers[provider_index].auth_state = AuthState::Ready;
                self.snapshot.providers[provider_index].health = ProviderHealth::Ready;
                self.emit(LbeEvent::ProviderAuthStateUpdated {
                    provider_id,
                    auth_state: AuthState::Ready,
                });
                self.emit(LbeEvent::ProviderHealthUpdated {
                    provider_id,
                    health: ProviderHealth::Ready,
                });
                self.emit(LbeEvent::ProviderValidationCompleted { provider_id });
                self.emit(LbeEvent::ProviderCatalogDiscovered {
                    providers: self.snapshot.providers.clone(),
                });
            }
            UserRequest::RemoveProvider { provider_id } => {
                let index = self
                    .snapshot
                    .providers
                    .iter()
                    .position(|provider| provider.provider_id == provider_id)
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "provider {} is not in the mock catalog",
                            provider_id.label()
                        ))
                    })?;
                self.snapshot.providers.remove(index);
                self.snapshot
                    .models
                    .retain(|model| model.provider_id != provider_id);
                if self
                    .snapshot
                    .selected_model
                    .as_ref()
                    .is_some_and(|model| model.provider_id == provider_id)
                {
                    self.snapshot.selected_model = None;
                }
                self.emit(LbeEvent::ProviderCatalogDiscovered {
                    providers: self.snapshot.providers.clone(),
                });
                self.emit(LbeEvent::ModelCatalogDiscovered {
                    models: self.snapshot.models.clone(),
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
            UserRequest::CompareCheckpoint { checkpoint_id } => {
                let Some(checkpoint) = self.snapshot.latest_checkpoint.as_ref() else {
                    return Err(LbeError::new("no checkpoint is available to compare"));
                };
                if checkpoint.checkpoint_id != checkpoint_id {
                    return Err(LbeError::new(
                        "checkpoint is not available in the runtime projection",
                    ));
                }
                self.emit(LbeEvent::CheckpointComparisonReady {
                    checkpoint_id,
                    changed_files: checkpoint.changed_files.clone(),
                });
            }
            UserRequest::RestoreCheckpoint { checkpoint_id } => {
                let Some(checkpoint) = self.snapshot.latest_checkpoint.as_ref() else {
                    return Err(LbeError::new("no checkpoint is available to restore"));
                };
                if checkpoint.checkpoint_id != checkpoint_id {
                    return Err(LbeError::new(
                        "checkpoint is not available in the runtime projection",
                    ));
                }
                self.emit(LbeEvent::CheckpointRestoreRequested {
                    checkpoint_id: checkpoint_id.clone(),
                });
                self.emit(LbeEvent::CheckpointRestoreBlocked {
                    checkpoint_id,
                    reason: "mock runtime cannot mutate the workspace; restore remains LBE-owned"
                        .to_owned(),
                });
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
    provider_config: Option<PathBuf>,
    capability_registry: Option<PathBuf>,
    session_id: Option<String>,
    task_id: Option<String>,
    pending_authorization: Option<(String, String, String)>,
    pending_events: VecDeque<LbeEvent>,
}

pub(crate) fn executed_receipt_id(
    payload: &serde_json::Value,
    tool_id: &str,
) -> Result<String, LbeError> {
    payload
        .get("receipt_id")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| LbeError::new(format!("{tool_id} executed response omitted receipt_id")))
}

pub(crate) fn governed_response_status<'a>(
    payload: &'a serde_json::Value,
    tool_id: &str,
) -> Result<&'a str, LbeError> {
    let status = payload
        .get("status")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| LbeError::new(format!("{tool_id} response omitted status")))?;
    match status {
        "EXECUTED" | "DENIED" | "ESCALATED" | "FAILED" => Ok(status),
        _ => Err(LbeError::new(format!(
            "{tool_id} response has unsupported status {status}"
        ))),
    }
}

pub(crate) fn parse_workspace_payload(
    stdout: &[u8],
    tool_id: &str,
) -> Result<serde_json::Value, LbeError> {
    let stdout = String::from_utf8(stdout.to_vec())
        .map_err(|_| LbeError::new(format!("{tool_id} stdout was not UTF-8")))?;
    serde_json::from_str(&stdout)
        .map_err(|error| LbeError::new(format!("invalid {tool_id} JSON: {error}")))
}

pub(crate) fn workspace_read_content(
    payload: &serde_json::Value,
) -> Result<(String, String), LbeError> {
    let output = payload.get("output").unwrap_or(payload);
    let content = output
        .get("content")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| LbeError::new("workspace.read response omitted content"))?
        .to_owned();
    let content_sha256 = output
        .get("content_sha256")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| LbeError::new("workspace.read response omitted content hash"))?
        .to_owned();
    Ok((content, content_sha256))
}

pub(crate) fn workspace_list_entries(
    payload: &serde_json::Value,
) -> Result<Vec<WorkspaceEntry>, LbeError> {
    let output = payload.get("output").unwrap_or(payload);
    output
        .get("entries")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| LbeError::new("workspace.list response omitted entries"))?
        .iter()
        .enumerate()
        .map(|(index, item)| {
            Ok(WorkspaceEntry {
                name: item
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        LbeError::new(format!("workspace.list entry {index} omitted name"))
                    })?
                    .to_owned(),
                path: item
                    .get("path")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        LbeError::new(format!("workspace.list entry {index} omitted path"))
                    })?
                    .to_owned(),
                entry_type: item
                    .get("type")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| {
                        LbeError::new(format!("workspace.list entry {index} omitted type"))
                    })?
                    .to_owned(),
            })
        })
        .collect()
}

fn workspace_output(payload: &serde_json::Value) -> &serde_json::Value {
    payload.get("output").unwrap_or(payload)
}

pub(crate) fn workspace_glob_matches(payload: &serde_json::Value) -> Result<(), LbeError> {
    let output = workspace_output(payload);
    let matches = output
        .get("matches")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| LbeError::new("workspace.glob response omitted matches"))?;
    for (index, item) in matches.iter().enumerate() {
        for field in ["path", "type"] {
            if item
                .get(field)
                .and_then(serde_json::Value::as_str)
                .is_none()
            {
                return Err(LbeError::new(format!(
                    "workspace.glob match {index} omitted {field}"
                )));
            }
        }
    }
    let count = output
        .get("match_count")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| LbeError::new("workspace.glob response omitted match_count"))?;
    if count != matches.len() as u64 {
        return Err(LbeError::new(
            "workspace.glob response match_count does not match matches",
        ));
    }
    Ok(())
}

pub(crate) fn workspace_search_results(payload: &serde_json::Value) -> Result<(), LbeError> {
    let output = workspace_output(payload);
    let results = output
        .get("results")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| LbeError::new("workspace.search response omitted results"))?;
    for (index, item) in results.iter().enumerate() {
        if !item.is_object() {
            return Err(LbeError::new(format!(
                "workspace.search result {index} is malformed"
            )));
        }
    }
    for field in ["indexed_result_count", "current_result_count"] {
        if output
            .get(field)
            .and_then(serde_json::Value::as_u64)
            .is_none()
        {
            return Err(LbeError::new(format!(
                "workspace.search response omitted {field}"
            )));
        }
    }
    let indexed = output["indexed_result_count"].as_u64().unwrap_or_default();
    let current = output["current_result_count"].as_u64().unwrap_or_default();
    if indexed + current != results.len() as u64 {
        return Err(LbeError::new(
            "workspace.search response result counts do not match results",
        ));
    }
    Ok(())
}

pub(crate) fn workspace_patch_result(
    payload: &serde_json::Value,
) -> Result<(String, bool, bool, u64, String, String, String), LbeError> {
    let output = workspace_output(payload);
    for field in ["path", "before_sha256", "sha256", "patch"] {
        if output
            .get(field)
            .and_then(serde_json::Value::as_str)
            .is_none()
        {
            return Err(LbeError::new(format!(
                "workspace.patch response omitted {field}"
            )));
        }
    }
    for field in ["created", "updated"] {
        if output
            .get(field)
            .and_then(serde_json::Value::as_bool)
            .is_none()
        {
            return Err(LbeError::new(format!(
                "workspace.patch response omitted {field}"
            )));
        }
    }
    if output
        .get("bytes")
        .and_then(serde_json::Value::as_u64)
        .is_none()
    {
        return Err(LbeError::new("workspace.patch response omitted bytes"));
    }
    Ok((
        output["path"].as_str().unwrap_or_default().to_owned(),
        output["created"].as_bool().unwrap_or_default(),
        output["updated"].as_bool().unwrap_or_default(),
        output["bytes"].as_u64().unwrap_or_default(),
        output["before_sha256"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        output["sha256"].as_str().unwrap_or_default().to_owned(),
        output["patch"].as_str().unwrap_or_default().to_owned(),
    ))
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
        let provider_config = std::env::var_os("LBE_PROVIDER_CONFIG").map(PathBuf::from);
        let capability_registry = std::env::var_os("LBE_CAPABILITY_REGISTRY").map(PathBuf::from);
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
            provider_config,
            capability_registry,
            session_id,
            task_id,
            pending_authorization: None,
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
        if let Some(provider_id) = session_context.data.session.provider_id.as_deref() {
            let provider_id = parse_provider_id(provider_id)?;
            self.snapshot.model_family = provider_id.label().to_owned();
            self.snapshot.selected_model = session_context
                .data
                .session
                .provider_model
                .as_ref()
                .map(|model_id| ModelRef {
                    provider_id,
                    model_id: model_id.clone(),
                });
        }
        if let Some(provider_model) = session_context.data.session.provider_model.as_ref() {
            self.snapshot.model_id = provider_model.clone();
        }
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

    fn refresh_mcp_registry(&mut self) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let registry = self
            .capability_registry
            .clone()
            .ok_or_else(|| LbeError::new("LBE_CAPABILITY_REGISTRY is not configured"))?;
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "capabilities",
                "list",
                "--registry",
            ])
            .arg(registry)
            .args(["--format", "json"])
            .output()
            .map_err(|error| LbeError::new(format!("MCP registry discovery failed: {error}")))?;
        if !output.status.success() {
            return Err(LbeError::new(format!(
                "MCP registry discovery exited unsuccessfully: {}",
                output.status
            )));
        }
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("MCP registry discovery stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid capabilities.list JSON: {error}")))?;
        let (schema_version, integrations) = parse_mcp_registry_payload(&payload)?;
        self.pending_events.push_back(LbeEvent::McpRegistryUpdated {
            schema_version,
            integrations,
        });
        Ok(())
    }

    fn query_birdeye(&mut self, tool: &str, arguments: serde_json::Value) -> Result<(), LbeError> {
        self.require_connected()?;
        if !arguments.is_object() {
            return Err(LbeError::new("BirdEye MCP arguments must be a JSON object"));
        }
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
            "tui.birdeye.query:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let execution_id = format!("exec_{operation_id}");
        let tool_call_id = format!("tool_{operation_id}");
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let tool_id = format!("mcp.birdeye.{tool}");
        let arguments_json = serde_json::to_string(&arguments)
            .map_err(|error| LbeError::new(format!("BirdEye arguments encoding failed: {error}")))?;
        self.pending_events.push_back(LbeEvent::ExecutionStarted {
            execution_id: execution_id.clone(),
        });
        self.pending_events.push_back(LbeEvent::ToolRequested {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: tool_id.clone(),
            input_summary: tool.to_owned(),
            risk: ToolRisk::ReadOnly,
        });
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "tool",
                &tool_id,
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
                ".",
                "--arguments",
                &arguments_json,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| LbeError::new(format!("BirdEye governed tool launch failed: {error}")))?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("BirdEye governed tool stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid governed BirdEye JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some(tool_id.as_str())
        {
            return Err(LbeError::new("governed BirdEye response identity mismatch"));
        }
        let status = payload
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FAILED");
        let output_payload = payload
            .get("output")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({
                "status": status,
                "error_code": payload.get("error_code").cloned().unwrap_or(serde_json::Value::Null),
                "error_message": payload.get("error_message").cloned().unwrap_or(serde_json::Value::Null),
            }));
        let output_text = serde_json::to_string(&output_payload)
            .map_err(|error| LbeError::new(format!("BirdEye result encoding failed: {error}")))?;
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
        let authorization = payload.get("authorization");
        self.pending_events.push_back(LbeEvent::AuthorizationResolved {
            operation_id: operation_id.clone(),
            approval_id: String::new(),
            verdict: authorization
                .and_then(|value| value.get("verdict"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("DENY")
                .to_owned(),
            rationale: authorization
                .and_then(|value| value.get("rationale"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("governed BirdEye authorization did not provide a rationale")
                .to_owned(),
        });
        if status == "EXECUTED" {
            self.pending_events.push_back(LbeEvent::ToolStarted {
                execution_id: execution_id.clone(),
                tool_call_id: tool_call_id.clone(),
            });
        }
        self.pending_events.push_back(LbeEvent::ToolOutputDelta {
            execution_id: execution_id.clone(),
            tool_call_id: tool_call_id.clone(),
            text: output_text,
        });
        self.pending_events.push_back(LbeEvent::BirdEyeQueryReady {
            tool: tool.to_owned(),
            payload: output_payload,
            evidence_ref: evidence_ref.clone(),
            receipt_id: receipt_id.clone(),
        });
        if status == "EXECUTED" {
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id,
            });
        } else {
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message: payload
                    .get("error_message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("governed BirdEye capability was not executed")
                    .to_owned(),
            });
        }
        Ok(())
    }

    fn refresh_provider_catalog(&mut self) -> Result<(), LbeError> {
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "--format",
                "json",
                "provider",
                "list",
            ])
            .output()
            .map_err(|error| LbeError::new(format!("provider discovery failed: {error}")))?;
        if !output.status.success() {
            return Err(LbeError::new(format!(
                "provider discovery exited unsuccessfully: {}",
                output.status
            )));
        }
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("provider discovery stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid provider.list JSON: {error}")))?;
        let provider_ids = parse_provider_list_payload(&payload)?;
        let checks = provider_ids
            .iter()
            .filter_map(|provider_id| {
                let provider_config = self.provider_config.as_ref()?;
                let output = Command::new(&python)
                    .current_dir(&wall_root)
                    .args([
                        "-m",
                        "lbe_guard_inspector.product_entry",
                        "provider",
                        "check",
                        "--provider",
                        provider_id.cli_name(),
                        "--provider-config",
                    ])
                    .arg(provider_config)
                    .output()
                    .ok()?;
                let payload = serde_json::from_slice::<serde_json::Value>(&output.stdout).ok()?;
                Some((*provider_id, payload))
            })
            .collect::<Vec<_>>();
        let providers = provider_ids
            .iter()
            .map(|provider_id| {
                let checked = checks
                    .iter()
                    .find(|(checked_id, _)| checked_id == provider_id)
                    .and_then(|(_, payload)| parse_provider_check_status(payload).ok());
                ProviderProjection {
                    provider_id: *provider_id,
                    auth_state: match checked.as_deref() {
                        Some("READY") => AuthState::Ready,
                        Some(_) => AuthState::Error,
                        None if self.provider_config.is_some() => AuthState::Error,
                        None => AuthState::NotConfigured,
                    },
                    health: match checked.as_deref() {
                        Some("READY") => ProviderHealth::Ready,
                        Some(_) => ProviderHealth::Error,
                        None if self.provider_config.is_some() => ProviderHealth::Error,
                        None => ProviderHealth::Unknown,
                    },
                    is_local: false,
                }
            })
            .collect::<Vec<_>>();
        let models = checks
            .iter()
            .filter_map(|(provider_id, payload)| {
                parse_provider_check_payload(payload, *provider_id).ok()
            })
            .collect::<Vec<_>>();
        self.pending_events
            .push_back(LbeEvent::ProviderDiscoveryStarted);
        self.pending_events
            .push_back(LbeEvent::ProviderCatalogDiscovered { providers });
        self.pending_events
            .push_back(LbeEvent::ModelCatalogDiscovered { models });
        self.pending_events
            .push_back(LbeEvent::ProviderDiscoveryCompleted {
                providers: provider_ids,
            });
        Ok(())
    }

    fn create_real_session(&mut self) -> Result<(), LbeError> {
        self.require_connected()?;
        let wall_root = self
            .wall_root
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_ROOT is not configured"))?;
        let target = self
            .target_workspace
            .clone()
            .ok_or_else(|| LbeError::new("LBE_TARGET_WORKSPACE is not configured"))?;
        let database = self
            .wall_database
            .clone()
            .ok_or_else(|| LbeError::new("LBE_WALL_DATABASE is not configured"))?;
        let workspace_id = self
            .snapshot
            .workspace_id
            .clone()
            .ok_or_else(|| LbeError::new("authoritative workspace identity is unavailable"))?;
        let session_id = format!("tui-{}", next_real_operation_ordinal());
        let mode = match self.snapshot.active_mode {
            AgentMode::Regular => "coding",
            AgentMode::Audit => "audit",
            AgentMode::Plan => "investigation",
        };
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "--format",
                "json",
                "session",
                "create",
                "--database",
            ])
            .arg(database)
            .args(["--workspace"])
            .arg(target)
            .args([
                "--project-workspace-id",
                &workspace_id,
                "--session-id",
                &session_id,
                "--mode",
                mode,
                "--permission",
                "read_only",
                "--runtime-policy",
                "audit",
            ])
            .output()
            .map_err(|error| LbeError::new(format!("session creation failed: {error}")))?;
        let payload = parse_workspace_payload(&output.stdout, "session.create")?;
        if !output.status.success() || payload.get("ok") != Some(&serde_json::Value::Bool(true)) {
            let message = payload
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("session creation was rejected by LBE");
            return Err(LbeError::new(message));
        }
        let returned_id = payload
            .get("session")
            .and_then(|session| session.get("session_id"))
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| LbeError::new("session.create response omitted session_id"))?;
        if payload.get("action").and_then(serde_json::Value::as_str) != Some("session.create")
            || returned_id != session_id
        {
            return Err(LbeError::new("session.create response identity mismatch"));
        }
        self.session_id = Some(session_id.clone());
        self.snapshot.session_id = None;
        self.snapshot.turn_id = None;
        self.snapshot.session_state = SessionStatus::Idle;
        self.attach()?;
        self.pending_events
            .push_back(LbeEvent::SessionStarted { session_id });
        Ok(())
    }

    fn resume_real_session(&mut self, session_id: String) -> Result<(), LbeError> {
        self.require_connected()?;
        if session_id.trim().is_empty() {
            return Err(LbeError::new("session_id must not be empty"));
        }
        let mut candidate = Self::new();
        candidate.session_id = Some(session_id.clone());
        candidate.attach()?;
        self.snapshot = candidate.snapshot;
        self.connection = candidate.connection;
        self.session_id = candidate.session_id;
        self.pending_events.extend(candidate.pending_events);
        self.pending_events
            .push_back(LbeEvent::SessionRestored { session_id });
        Ok(())
    }
    fn select_model(&mut self, model: ModelRef) -> Result<(), LbeError> {
        self.require_connected()?;
        if !self.snapshot.models.iter().any(|candidate| {
            candidate.provider_id == model.provider_id && candidate.model_id == model.model_id
        }) {
            return Err(LbeError::new(format!(
                "model {} is not in the discovered LBE catalog",
                model.model_id
            )));
        }
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
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "--format",
                "json",
                "provider",
                "select",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--provider",
                model.provider_id.cli_name(),
                "--model",
                &model.model_id,
            ])
            .output()
            .map_err(|error| LbeError::new(format!("provider selection failed: {error}")))?;
        let payload = parse_workspace_payload(&output.stdout, "provider.select")?;
        if !output.status.success() || payload.get("ok") != Some(&serde_json::Value::Bool(true)) {
            let message = payload
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("provider selection was rejected by LBE");
            return Err(LbeError::new(message));
        }
        if payload.get("action").and_then(serde_json::Value::as_str) != Some("provider.select")
            || payload
                .get("session_id")
                .and_then(serde_json::Value::as_str)
                != Some(session_id.as_str())
            || payload
                .get("provider_id")
                .and_then(serde_json::Value::as_str)
                != Some(model.provider_id.cli_name())
            || payload
                .get("provider_model")
                .and_then(serde_json::Value::as_str)
                != Some(model.model_id.as_str())
        {
            return Err(LbeError::new("provider.select response identity mismatch"));
        }
        self.snapshot.selected_model = Some(model.clone());
        self.snapshot.model_id = model.model_id.clone();
        self.snapshot.model_family = model.provider_id.label().to_owned();
        self.pending_events.push_back(LbeEvent::SnapshotUpdated {
            snapshot: self.snapshot.clone(),
        });
        Ok(())
    }

    fn submit_conversational_turn(
        &mut self,
        intent: &str,
        mode: AgentMode,
    ) -> Result<(), LbeError> {
        self.require_connected()?;
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
        let provider_config = self
            .provider_config
            .clone()
            .ok_or_else(|| LbeError::new("LBE_PROVIDER_CONFIG is not configured"))?;
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "turn",
                "--database",
            ])
            .arg(database)
            .args([
                "--session-id",
                &session_id,
                "--text",
                intent,
                "--provider-config",
            ])
            .arg(provider_config)
            .args(["--format", "json"])
            .output()
            .map_err(|error| LbeError::new(format!("turn bridge launch failed: {error}")))?;
        let payload = parse_workspace_payload(&output.stdout, "turn")?;
        if !output.status.success() || payload.get("ok") != Some(&serde_json::Value::Bool(true)) {
            let message = payload
                .get("message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("reason").and_then(serde_json::Value::as_str))
                .unwrap_or("turn bridge rejected the request");
            return Err(LbeError::new(message));
        }
        if payload
            .get("session_id")
            .and_then(serde_json::Value::as_str)
            != Some(session_id.as_str())
        {
            return Err(LbeError::new(
                "turn bridge response session identity mismatch",
            ));
        }
        let turn_id = payload
            .get("turn_id")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| LbeError::new("turn bridge response omitted turn_id"))?;
        let returned_mode = payload
            .get("mode")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let expected_mode = match mode {
            AgentMode::Regular => "coding",
            AgentMode::Plan => "investigation",
            AgentMode::Audit => "audit",
        };
        if returned_mode != expected_mode {
            return Err(LbeError::new("turn bridge response mode mismatch"));
        }
        let events = payload
            .get("events")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| LbeError::new("turn bridge response omitted events"))?;
        self.snapshot.turn_id = Some(turn_id.to_owned());
        for event in events {
            self.project_conversational_event(event, mode, turn_id)?;
        }
        Ok(())
    }

    fn project_conversational_event(
        &mut self,
        event: &serde_json::Value,
        mode: AgentMode,
        turn_id: &str,
    ) -> Result<(), LbeError> {
        if event.get("session_id").and_then(serde_json::Value::as_str)
            != self.snapshot.session_id.as_deref()
            || event.get("turn_id").and_then(serde_json::Value::as_str) != Some(turn_id)
        {
            return Err(LbeError::new("turn bridge event identity mismatch"));
        }
        let event_id = event
            .get("event_id")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| LbeError::new("turn bridge event omitted event_id"))?
            .to_owned();
        let event_type = event
            .get("event_type")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| LbeError::new("turn bridge event omitted event_type"))?;
        let payload = event.get("payload").unwrap_or(&serde_json::Value::Null);
        match event_type {
            "model.message.completed" => {
                let text = payload
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| LbeError::new("turn bridge message omitted text"))?;
                self.pending_events
                    .push_back(LbeEvent::ConversationalTurnMessage {
                        session_id: self.snapshot.session_id.clone().unwrap_or_default(),
                        turn_id: turn_id.to_owned(),
                        event_id,
                        text: text.to_owned(),
                    });
            }
            "tool.completed" | "tool.denied" | "tool.escalated" | "tool.failed" => {
                let operation_id = event
                    .get("runtime_operation_id")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned);
                let tool_id = payload
                    .get("tool_id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("unknown")
                    .to_owned();
                let receipt_id = event
                    .get("tool_receipt_id")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
                    .or_else(|| {
                        payload
                            .get("receipt_id")
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_owned)
                    });
                let evidence_ref = payload
                    .get("evidence")
                    .and_then(serde_json::Value::as_array)
                    .and_then(|items| items.first())
                    .and_then(|item| item.get("ref"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned);
                self.pending_events
                    .push_back(LbeEvent::ConversationalToolReceipt {
                        session_id: self.snapshot.session_id.clone().unwrap_or_default(),
                        turn_id: turn_id.to_owned(),
                        event_id,
                        operation_id,
                        tool_id,
                        status: event_type.to_owned(),
                        receipt_id,
                        evidence_ref,
                    });
            }
            "model.turn.completed" => {
                self.pending_events
                    .push_back(LbeEvent::ConversationalTurnCompleted {
                        session_id: self.snapshot.session_id.clone().unwrap_or_default(),
                        turn_id: turn_id.to_owned(),
                        event_id,
                    });
            }
            "model.error" => {
                let message = payload
                    .get("error_message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("LBE conversational turn failed")
                    .to_owned();
                self.pending_events
                    .push_back(LbeEvent::WrapperError { message });
            }
            "user.message"
            | "runtime.guidance.loaded"
            | "runtime.provider.queued"
            | "runtime.provider.running"
            | "model.turn.started"
            | "model.usage.updated" => {}
            _ => {
                return Err(LbeError::new(format!(
                    "unsupported turn bridge event type: {event_type}"
                )));
            }
        }
        if mode == AgentMode::Audit && event_type == "model.turn.completed" {
            self.snapshot.session_state = SessionStatus::Completed;
        }
        Ok(())
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

        let payload = parse_workspace_payload(&output.stdout, "workspace.read")?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.read")
        {
            return Err(LbeError::new("workspace.read response identity mismatch"));
        }

        let status = governed_response_status(&payload, "workspace.read")?;
        if output.status.success() && status == "EXECUTED" {
            let receipt_id = executed_receipt_id(&payload, "workspace.read")?;
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let (content, content_sha256) = workspace_read_content(&payload)?;
            self.pending_events.push_back(LbeEvent::WorkspaceReadReady {
                path: path.to_owned(),
                content,
                content_sha256,
                evidence_ref: evidence_ref.clone(),
                receipt_id: Some(receipt_id.clone()),
            });
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id,
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id: format!("exec_{operation_id}"),
                receipt_id: Some(receipt_id),
            });
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
        let payload = parse_workspace_payload(&output.stdout, "workspace.list")?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.list")
        {
            return Err(LbeError::new("workspace.list response identity mismatch"));
        }
        let status = governed_response_status(&payload, "workspace.list")?;
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = executed_receipt_id(&payload, "workspace.list")?;
            let entries = workspace_list_entries(&payload)?;
            self.pending_events
                .push_back(LbeEvent::WorkspaceListingReady {
                    path: path.to_owned(),
                    entries,
                    evidence_ref: evidence_ref.clone(),
                    receipt_id: Some(receipt_id.clone()),
                });
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id: Some(receipt_id),
            });
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
        let payload = parse_workspace_payload(&output.stdout, "workspace.glob")?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.glob")
        {
            return Err(LbeError::new("workspace.glob response identity mismatch"));
        }
        let status = governed_response_status(&payload, "workspace.glob")?;
        if output.status.success() && status == "EXECUTED" {
            workspace_glob_matches(&payload)?;
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = executed_receipt_id(&payload, "workspace.glob")?;
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id: Some(receipt_id),
            });
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
        let payload = parse_workspace_payload(&output.stdout, "workspace.search")?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str)
                != Some("workspace.search")
        {
            return Err(LbeError::new("workspace.search response identity mismatch"));
        }
        let status = governed_response_status(&payload, "workspace.search")?;
        if output.status.success() && status == "EXECUTED" {
            workspace_search_results(&payload)?;
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = executed_receipt_id(&payload, "workspace.search")?;
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id: Some(receipt_id),
            });
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
        let payload = parse_workspace_payload(&output.stdout, "workspace.patch")?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str) != Some("workspace.patch")
        {
            return Err(LbeError::new("workspace.patch response identity mismatch"));
        }
        let status = governed_response_status(&payload, "workspace.patch")?;
        if output.status.success() && status == "EXECUTED" {
            let (patch_path, created, updated, bytes, before_sha256, sha256, patch) =
                workspace_patch_result(&payload)?;
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = executed_receipt_id(&payload, "workspace.patch")?;
            self.pending_events
                .push_back(LbeEvent::WorkspacePatchReady {
                    patch: WorkspacePatch {
                        path: patch_path,
                        created,
                        updated,
                        bytes,
                        before_sha256,
                        sha256,
                        patch,
                        evidence_ref: evidence_ref.clone(),
                        receipt_id: receipt_id.clone(),
                    },
                });
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id: Some(receipt_id),
            });
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

    fn run_registered_process(&mut self, command_id: &str) -> Result<(), LbeError> {
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
            "tui.process.run_registered:{}:{}",
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
            tool_name: "process.run_registered".to_owned(),
            input_summary: command_id.to_owned(),
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
                "process.run_registered",
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
                "--command-id",
                command_id,
                "--path",
                ".",
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| {
                LbeError::new(format!(
                    "process.run_registered process launch failed: {error}"
                ))
            })?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("process.run_registered stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout).map_err(|error| {
            LbeError::new(format!("invalid process.run_registered JSON: {error}"))
        })?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload.get("tool_id").and_then(serde_json::Value::as_str)
                != Some("process.run_registered")
        {
            return Err(LbeError::new(
                "process.run_registered response identity mismatch",
            ));
        }
        let status = governed_response_status(&payload, "registered process")?;
        if output.status.success() && status == "EXECUTED" {
            let evidence_ref = payload
                .get("evidence")
                .and_then(serde_json::Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("ref"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned);
            let receipt_id = executed_receipt_id(&payload, "process.run_registered")?;
            self.pending_events.push_back(LbeEvent::ToolCompleted {
                execution_id: execution_id.clone(),
                tool_call_id,
                evidence_ref,
            });
            self.pending_events.push_back(LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id: Some(receipt_id),
            });
        } else {
            let message = payload
                .get("error_message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
                .unwrap_or("process.run_registered was not executed")
                .to_owned();
            self.pending_events.push_back(LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            });
        }
        Ok(())
    }

    fn request_authorization(&mut self, capability: &str) -> Result<(), LbeError> {
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
            "tui.authorization:{}:{}",
            session_id,
            next_real_operation_ordinal()
        );
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "authorization",
                "evaluate",
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
                "--capability",
                capability,
                "--operation-id",
                &operation_id,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| LbeError::new(format!("authorization evaluation failed: {error}")))?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("authorization evaluation stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|error| LbeError::new(format!("invalid authorization JSON: {error}")))?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload
                .get("capability")
                .and_then(serde_json::Value::as_str)
                != Some(capability)
        {
            return Err(LbeError::new("authorization response identity mismatch"));
        }
        let verdict = payload
            .get("verdict")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("DENY")
            .to_owned();
        let rationale = payload
            .get("rationale")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("authorization did not provide a rationale")
            .to_owned();
        let approval_id = payload
            .get("approval_id")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned);
        if verdict == "REQUIRE_APPROVAL" {
            let approval_id = approval_id
                .ok_or_else(|| LbeError::new("authorization required without approval ID"))?;
            self.pending_authorization = Some((
                operation_id.clone(),
                approval_id.clone(),
                capability.to_owned(),
            ));
            self.pending_events
                .push_back(LbeEvent::AuthorizationRequired {
                    operation_id,
                    approval_id,
                    capability: capability.to_owned(),
                    rationale,
                });
        } else {
            self.pending_events
                .push_back(LbeEvent::AuthorizationResolved {
                    operation_id,
                    approval_id: approval_id.unwrap_or_default(),
                    verdict,
                    rationale,
                });
        }
        Ok(())
    }

    fn resolve_authorization(
        &mut self,
        requested_approval_id: &str,
        decision: &str,
    ) -> Result<(), LbeError> {
        let (operation_id, approval_id, capability) = self
            .pending_authorization
            .clone()
            .ok_or_else(|| LbeError::new("no Agent Wall authorization is pending"))?;
        if requested_approval_id != approval_id {
            return Err(LbeError::new(
                "approval ID does not match pending Agent Wall authorization",
            ));
        }
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
        let python = std::env::var_os("LBE_WALL_PYTHON")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("python"));
        let output = Command::new(&python)
            .current_dir(&wall_root)
            .args([
                "-m",
                "lbe_guard_inspector.product_entry",
                "authorization",
                "resolve",
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
                "--capability",
                &capability,
                "--operation-id",
                &operation_id,
                "--approval-id",
                &approval_id,
                "--decision",
                decision,
                "--format",
                "json",
            ])
            .output()
            .map_err(|error| LbeError::new(format!("authorization resolution failed: {error}")))?;
        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| LbeError::new("authorization resolution stdout was not UTF-8"))?;
        let payload: serde_json::Value = serde_json::from_str(&stdout).map_err(|error| {
            LbeError::new(format!("invalid authorization resolution JSON: {error}"))
        })?;
        if payload
            .get("operation_id")
            .and_then(serde_json::Value::as_str)
            != Some(operation_id.as_str())
            || payload
                .get("approval_id")
                .and_then(serde_json::Value::as_str)
                != Some(approval_id.as_str())
        {
            return Err(LbeError::new("authorization resolution identity mismatch"));
        }
        let verdict = payload
            .get("verdict")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("DENY")
            .to_owned();
        let rationale = payload
            .get("rationale")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("authorization resolution did not provide a rationale")
            .to_owned();
        self.pending_authorization = None;
        self.pending_events
            .push_back(LbeEvent::AuthorizationResolved {
                operation_id,
                approval_id,
                verdict,
                rationale,
            });
        Ok(())
    }
}

fn parse_mcp_registry_payload(
    payload: &serde_json::Value,
) -> Result<(u64, Vec<McpIntegration>), LbeError> {
    if payload.get("ok").and_then(serde_json::Value::as_bool) != Some(true)
        || payload.get("action").and_then(serde_json::Value::as_str) != Some("capabilities.list")
        || payload
            .get("execution_attempted")
            .and_then(serde_json::Value::as_bool)
            != Some(false)
    {
        return Err(LbeError::new(
            "capabilities.list response failed metadata-only contract",
        ));
    }
    let schema_version = payload
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| LbeError::new("capabilities.list response omitted schema_version"))?;
    if schema_version != 1 {
        return Err(LbeError::new(format!(
            "unsupported capabilities.list schema_version: {schema_version}"
        )));
    }
    let items = payload
        .get("integrations")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| LbeError::new("capabilities.list response omitted integrations"))?;
    let integrations = items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let field = |name: &str| {
                item.get(name)
                    .and_then(serde_json::Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| {
                        LbeError::new(format!(
                            "capabilities.list integration {index} omitted {name}"
                        ))
                    })
            };
            Ok(McpIntegration {
                integration_id: field("integration_id")?,
                adapter_id: field("adapter_id")?,
                tool_id: field("tool_id")?,
                description: field("description")?,
                enabled: item
                    .get("enabled")
                    .and_then(serde_json::Value::as_bool)
                    .ok_or_else(|| LbeError::new(format!("capabilities.list integration {index} omitted enabled")))?,
                credential_ref_configured: item
                    .get("credential_ref_configured")
                    .and_then(serde_json::Value::as_bool)
                    .ok_or_else(|| LbeError::new(format!("capabilities.list integration {index} omitted credential_ref_configured")))?,
                availability: field("availability")?,
                rationale: field("rationale")?,
                access_class: field("access_class")?,
                network_behavior: field("network_behavior")?,
                risk_class: field("risk_class")?,
                timeout_seconds: item
                    .get("timeout_seconds")
                    .and_then(serde_json::Value::as_f64)
                    .ok_or_else(|| LbeError::new(format!("capabilities.list integration {index} omitted timeout_seconds")))?,
                retry_policy: field("retry_policy")?,
            })
        })
        .collect::<Result<Vec<_>, LbeError>>()?;
    Ok((schema_version, integrations))
}

fn parse_provider_check_status(payload: &serde_json::Value) -> Result<&str, LbeError> {
    if payload.get("ok").and_then(serde_json::Value::as_bool) != Some(true)
        || payload.get("action").and_then(serde_json::Value::as_str) != Some("provider.check")
    {
        return Err(LbeError::new("provider.check response failed contract"));
    }
    payload
        .get("status")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| LbeError::new("provider.check response omitted status"))
}

pub(crate) fn parse_provider_check_payload(
    payload: &serde_json::Value,
    provider_id: ProviderId,
) -> Result<ModelDescriptor, LbeError> {
    if parse_provider_check_status(payload)? != "READY"
        || payload
            .get("provider_id")
            .and_then(serde_json::Value::as_str)
            != Some(provider_id.cli_name())
    {
        return Err(LbeError::new(
            "provider.check response identity or readiness mismatch",
        ));
    }
    let model_id = payload
        .get("provider_model")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| LbeError::new("provider.check response omitted provider_model"))?;
    let capabilities = payload
        .get("capabilities")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| LbeError::new("provider.check response omitted capabilities"))?;
    let boolean = |name: &str| {
        capabilities
            .get(name)
            .and_then(serde_json::Value::as_bool)
            .ok_or_else(|| LbeError::new(format!("provider.check capabilities omitted {name}")))
    };
    let context_limit = capabilities
        .get("context_limit")
        .and_then(serde_json::Value::as_u64)
        .map(u32::try_from)
        .transpose()
        .map_err(|_| LbeError::new("provider.check context_limit is too large"))?;
    let caps = ProviderCapabilities {
        streaming: boolean("streaming")?,
        tools: boolean("tool_calls")?,
        reasoning: false,
        images: false,
        prompt_caching: false,
        max_context: context_limit,
        max_output: None,
    };
    Ok(ModelDescriptor {
        provider_id,
        model_id: model_id.to_owned(),
        display_name: model_id.to_owned(),
        context_window: caps.max_context,
        max_output_tokens: caps.max_output,
        capabilities: caps,
    })
}

pub(crate) fn parse_provider_list_payload(
    payload: &serde_json::Value,
) -> Result<Vec<ProviderId>, LbeError> {
    if payload.get("ok").and_then(serde_json::Value::as_bool) != Some(true)
        || payload.get("action").and_then(serde_json::Value::as_str) != Some("provider.list")
    {
        return Err(LbeError::new("provider.list response failed contract"));
    }
    let items = payload
        .get("providers")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| LbeError::new("provider.list response omitted providers"))?;
    items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let value = item
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    LbeError::new(format!("provider.list provider {index} was not a string"))
                })?;
            match value {
                "openai-compatible" => Ok(ProviderId::OpenAiCompatible),
                _ => Err(LbeError::new(format!(
                    "provider.list returned unsupported provider: {value}"
                ))),
            }
        })
        .collect()
}

fn parse_provider_id(value: &str) -> Result<ProviderId, LbeError> {
    match value.trim() {
        "openai-compatible" => Ok(ProviderId::OpenAiCompatible),
        other => Err(LbeError::new(format!(
            "session_context returned unsupported provider: {other}"
        ))),
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
            UserRequest::StartSession => self.create_real_session(),
            UserRequest::ListSessions => self.require_connected(),
            UserRequest::ResumeSession { session_id } => self.resume_real_session(session_id),
            UserRequest::CloseSession { .. } => self.require_connected(),
            UserRequest::ConfigureProvider { .. } => self.require_connected(),
            UserRequest::ValidateProvider { .. } => self.require_connected(),
            UserRequest::RemoveProvider { .. } => self.require_connected(),
            UserRequest::RefreshRuntimeSnapshot => {
                self.require_connected()?;
                self.attach()
            }
            UserRequest::RefreshMcpRegistry => {
                self.require_connected()?;
                self.refresh_mcp_registry()
            }
            UserRequest::QueryBirdEye { tool, arguments } => self.query_birdeye(&tool, arguments),
            UserRequest::RefreshProviderCatalog => {
                self.require_connected()?;
                self.refresh_provider_catalog()
            }
            UserRequest::SelectModel { model } => self.select_model(model),
            UserRequest::SubmitTask { intent, mode } => {
                self.submit_conversational_turn(&intent, mode)
            }
            UserRequest::Continue {
                session_id,
                message,
            } => {
                self.require_connected()?;
                let active_session_id = self
                    .snapshot
                    .session_id
                    .as_deref()
                    .or(self.session_id.as_deref())
                    .ok_or_else(|| LbeError::new("LBE session is not configured"))?;
                if session_id != active_session_id {
                    return Err(LbeError::new(
                        "continuation session_id does not match the active LBE session",
                    ));
                }
                self.submit_conversational_turn(&message, self.snapshot.active_mode)
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
            UserRequest::RunRegisteredProcess { command_id } => {
                self.run_registered_process(&command_id)
            }
            UserRequest::RequestAuthorization { capability } => {
                self.request_authorization(&capability)
            }
            UserRequest::Approve { approval_id } => {
                self.resolve_authorization(&approval_id, "approve")
            }
            UserRequest::Reject { approval_id } => {
                self.resolve_authorization(&approval_id, "reject")
            }
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
