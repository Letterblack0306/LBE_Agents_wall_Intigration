use std::time::{Duration, Instant};

use ratatui::termina::event::{KeyCode, KeyEvent, KeyEventKind, Modifiers};

use crate::{
    browser_chat::BrowserChatProvider,
    events::LbeEvent,
    requests::{LbeError, UserRequest},
    types::*,
    wrapper::LbeWrapper,
};

// ---------------------------------------------------------------------------
// App — the central UI state machine
// ---------------------------------------------------------------------------

pub(crate) struct App {
    pub(crate) input: String,
    pub(crate) transcript: Vec<String>,
    pub(crate) phase: Phase,
    pub(crate) agent_mode: AgentMode,
    pub(crate) show_shortcuts: bool,
    pub(crate) panel: Option<MockPanel>,
    pub(crate) input_history: Vec<String>,
    pub(crate) history_index: Option<usize>,
    pub(crate) should_quit: bool,
    pub(crate) intro_started_at: Instant,
    pub(crate) snapshot: LbeSnapshot,
}

impl Default for App {
    fn default() -> Self {
        Self {
            input: String::new(),
            transcript: Vec::new(),
            phase: Phase::Welcome,
            agent_mode: AgentMode::Regular,
            show_shortcuts: false,
            panel: None,
            input_history: Vec::new(),
            history_index: None,
            should_quit: false,
            intro_started_at: Instant::now(),
            snapshot: LbeSnapshot::default(),
        }
    }
}

impl App {
    pub(crate) fn with_snapshot(snapshot: LbeSnapshot) -> Self {
        Self {
            snapshot,
            ..Self::default()
        }
    }

    pub(crate) fn should_quit(&self) -> bool {
        self.should_quit
    }

    pub(crate) fn handle_key(
        &mut self,
        key: KeyEvent,
        wrapper: &mut impl LbeWrapper,
        now: Instant,
    ) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        if matches!(key.code, KeyCode::Char('c')) && key.modifiers.contains(Modifiers::CONTROL) {
            if matches!(self.phase, Phase::Running) {
                self.apply_wrapper_result(wrapper.submit(UserRequest::Abort, Instant::now()));
            } else {
                self.should_quit = true;
            }
            return;
        }
        match key.code {
            KeyCode::Char('q') if self.input.is_empty() => self.should_quit = true,
            KeyCode::Char('?') if self.input.is_empty() => {
                self.show_shortcuts = !self.show_shortcuts
            }
            KeyCode::Tab => self.set_mode(wrapper, self.agent_mode.next()),
            KeyCode::Escape => self.dismiss_or_reject(wrapper),
            KeyCode::Enter => self.submit_or_approve(wrapper, now),
            KeyCode::Up => self.recall_history(true),
            KeyCode::Down => self.recall_history(false),
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(character) if !key.modifiers.contains(Modifiers::CONTROL) => {
                if !matches!(self.phase, Phase::Running { .. }) {
                    self.input.push(character);
                }
            }
            KeyCode::Char('d')
                if key.modifiers.contains(Modifiers::CONTROL) && self.input.is_empty() =>
            {
                self.should_quit = true;
            }
            KeyCode::Char('l') if key.modifiers.contains(Modifiers::CONTROL) => {
                self.transcript.clear();
                self.panel = None;
                self.show_shortcuts = false;
            }
            _ => {}
        }
    }

    pub(crate) fn submit_or_approve(&mut self, wrapper: &mut impl LbeWrapper, now: Instant) {
        match &self.phase {
            Phase::AwaitingApproval { approval_id, .. } => {
                self.apply_wrapper_result(wrapper.submit(
                    UserRequest::Approve {
                        approval_id: approval_id.clone(),
                    },
                    now,
                ));
            }
            Phase::Running => {}
            _ if self.input.trim().is_empty() => {}
            _ => {
                let task = self.input.trim().to_owned();
                if task.starts_with('/') {
                    self.input.clear();
                    self.handle_command(&task, wrapper);
                    return;
                }
                self.transcript.push(format!("you        {task}"));
                self.input_history.push(task.clone());
                self.history_index = None;
                self.input.clear();
                self.apply_wrapper_result(wrapper.submit(
                    UserRequest::SubmitTask {
                        intent: task,
                        mode: self.agent_mode,
                    },
                    now,
                ));
            }
        }
    }
pub(crate) fn dismiss_or_reject(&mut self, wrapper: &mut impl LbeWrapper) {
        if self.panel.is_some() || self.show_shortcuts {
            self.panel = None;
            self.show_shortcuts = false;
            return;
        }
        if let Phase::AwaitingApproval { approval_id, .. } = &self.phase {
            self.apply_wrapper_result(wrapper.submit(
                UserRequest::Reject {
                    approval_id: approval_id.clone(),
                },
                Instant::now(),
            ));
        }
    }

    pub(crate) fn set_mode(&mut self, wrapper: &mut impl LbeWrapper, mode: AgentMode) {
        self.apply_wrapper_result(wrapper.submit(UserRequest::SetMode { mode }, Instant::now()));
    }

    pub(crate) fn apply_wrapper_result(&mut self, result: Result<(), LbeError>) {
        if let Err(error) = result {
            self.transcript
                .push(format!("LBE WRAPPER ERROR  {}", error.message));
        }
    }
pub(crate) fn handle_command(&mut self, command: &str, wrapper: &mut impl LbeWrapper) {
        let command = command
            .split_whitespace()
            .next()
            .unwrap_or(command)
            .to_ascii_lowercase();
        self.show_shortcuts = false;
        self.panel = match command.as_str() {
            "/help" => {
                self.show_shortcuts = true;
                None
            }
            "/account" => Some(MockPanel::Account),
            "/provider" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RefreshProviderCatalog, Instant::now()),
                );
                Some(MockPanel::Provider)
            }
            "/model" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RefreshProviderCatalog, Instant::now()),
                );
                Some(MockPanel::Model)
            }
            "/mcp" => Some(MockPanel::Mcp),
            "/tools" => Some(MockPanel::Tools),
            "/history" => Some(MockPanel::History),
            "/session" => Some(MockPanel::Session),
            "/evidence" => Some(MockPanel::Evidence),
            "/receipts" => Some(MockPanel::Receipts),
            "/status" => Some(MockPanel::Status),
            "/memory" => {
                self.apply_wrapper_result(wrapper.submit(
                    UserRequest::RecallSessionMemory {
                        query: "recent".to_owned(),
                        limit: 5,
                    },
                    Instant::now(),
                ));
                Some(MockPanel::Memory)
            }
            "/browser" => Some(MockPanel::Browser),
            "/browser-chat" => Some(MockPanel::Browser),
            "/browser-attach" => {
                self.apply_wrapper_result(wrapper.submit(
                    UserRequest::AttachBrowserChat {
                        provider: BrowserChatProvider::ChatGpt,
                        conversation_ref: None,
                    },
                    Instant::now(),
                ));
                Some(MockPanel::Browser)
            }
            "/browser-detach" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::DetachBrowserChat, Instant::now()),
                );
                Some(MockPanel::Browser)
            }
            "/doctor" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RunDiagnostics, Instant::now()),
                );
                Some(MockPanel::Doctor)
            }
            "/undo" => Some(MockPanel::Undo),
            "/checkpoints" => Some(MockPanel::Undo),
            "/mode" => {
                self.transcript
                    .push(format!("SYSTEM  active mode: {}", self.agent_mode.label()));
                None
            }
            "/audit" => {
                self.set_mode(wrapper, AgentMode::Audit);
                self.transcript
                    .push("SYSTEM  requested Lbe Audit mode.".to_owned());
                None
            }
            "/compact" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::CompactContext, Instant::now()),
                );
                None
            }
            "/clear" => {
                self.transcript.clear();
                None
            }
            "/new" => {
                self.transcript.clear();
                self.phase = Phase::Welcome;
                self.transcript
                    .push("SYSTEM  new mock session started.".to_owned());
                None
            }
            "/quit" => {
                self.should_quit = true;
                None
            }
            _ => {
                self.transcript.push(format!(
                    "SYSTEM  unsupported command: {command}; use /help."
                ));
                None
            }
        };
    }


    pub(crate) fn recall_history(&mut self, older: bool) {
        if self.input_history.is_empty() {
            return;
        }
        let last = self.input_history.len() - 1;
        let index = match (self.history_index, older) {
            (None, true) => last,
            (Some(index), true) => index.saturating_sub(1),
            (None, false) => return,
            (Some(index), false) if index >= last => {
                self.history_index = None;
                self.input.clear();
                return;
            }
            (Some(index), false) => index + 1,
        };
        self.history_index = Some(index);
        self.input = self.input_history[index].clone();
    }


    pub(crate) fn reduce_lbe_event(&mut self, event: LbeEvent) {
        match event {
            LbeEvent::SessionStarted { session_id } => {
                self.transcript
                    .push(format!("SESSION  started · {session_id}"));
            }
            LbeEvent::SessionRestored { session_id } => {
                self.transcript
                    .push(format!("SESSION  restored · {session_id}"));
            }
            LbeEvent::RuntimeAttachmentUpdated {
                connection,
                runtime_id,
                runtime_mode,
                attached_client_count,
            } => {
                self.snapshot.connection = connection;
                self.snapshot.runtime_id = runtime_id;
                self.snapshot.runtime_mode = runtime_mode;
                self.snapshot.attached_client_count = attached_client_count;
            }
            LbeEvent::SessionStatusUpdated { status } => {
                self.snapshot.session_state = status;
            }
            LbeEvent::SnapshotUpdated { snapshot } => {
                self.agent_mode = snapshot.active_mode;
                self.snapshot = snapshot;
            }
            LbeEvent::ProviderCatalogDiscovered { providers } => {
                self.snapshot.providers = providers;
            }
            LbeEvent::ProviderHealthUpdated {
                provider_id,
                health,
            } => {
                if let Some(provider) = self
                    .snapshot
                    .providers
                    .iter_mut()
                    .find(|provider| provider.provider_id == provider_id)
                {
                    provider.health = health;
                }
            }
            LbeEvent::ProviderAuthStateUpdated {
                provider_id,
                auth_state,
            } => {
                if let Some(provider) = self
                    .snapshot
                    .providers
                    .iter_mut()
                    .find(|provider| provider.provider_id == provider_id)
                {
                    provider.auth_state = auth_state;
                }
            }
            LbeEvent::ProviderDiscoveryStarted => {
                self.transcript.push("PROVIDER  discovery started".to_owned());
            }
            LbeEvent::ProviderDiscoveryCompleted { providers } => {
                self.transcript.push(format!(
                    "PROVIDER  discovery completed · {} provider(s)",
                    providers.len()
                ));
            }
            LbeEvent::ProviderValidationStarted { provider_id } => {
                self.transcript.push(format!(
                    "PROVIDER  validation started · {}",
                    provider_id.label()
                ));
            }
            LbeEvent::ProviderValidationCompleted { provider_id } => {
                self.transcript.push(format!(
                    "PROVIDER  validation completed · {}",
                    provider_id.label()
                ));
            }
            LbeEvent::ModelCatalogDiscovered { models } => {
                self.snapshot.models = models;
            }
            LbeEvent::CheckpointCreated { checkpoint } => {
                self.snapshot.latest_checkpoint = Some(checkpoint.clone());
                self.transcript.push(format!(
                    "CHECKPOINT  created · {} · {} file(s)",
                    checkpoint.checkpoint_id,
                    checkpoint.changed_files.len()
                ));
            }
            LbeEvent::CheckpointComparisonReady {
                checkpoint_id,
                changed_files,
            } => {
                self.transcript.push(format!(
                    "CHECKPOINT  comparison ready · {checkpoint_id} · {} file(s)",
                    changed_files.len()
                ));
            }
            LbeEvent::CheckpointRestoreRequested { checkpoint_id } => {
                self.transcript
                    .push(format!("CHECKPOINT  restore requested · {checkpoint_id}"));
            }
            LbeEvent::CheckpointRestoreBlocked {
                checkpoint_id,
                reason,
            } => {
                self.transcript.push(format!(
                    "CHECKPOINT  restore blocked · {checkpoint_id} · {reason}"
                ));
            }
            LbeEvent::CheckpointRestored { checkpoint_id } => {
                self.transcript
                    .push(format!("CHECKPOINT  restored · {checkpoint_id}"));
            }
            LbeEvent::CommandStarted {
                tool_call_id,
                command_id,
                command_summary,
            } => {
                self.transcript.push(format!(
                    "COMMAND  started · {command_id} · {tool_call_id} · {command_summary}"
                ));
            }
            LbeEvent::CommandStdoutDelta {
                command_id, text, ..
            } => self
                .transcript
                .push(format!("  STDOUT {command_id} · {text}")),
            LbeEvent::CommandStderrDelta {
                command_id, text, ..
            } => self
                .transcript
                .push(format!("  STDERR {command_id} · {text}")),
            LbeEvent::CommandCompleted {
                command_id,
                exit_code,
                ..
            } => self.transcript.push(format!(
                "COMMAND  completed · {command_id} · exit {exit_code}"
            )),
            LbeEvent::CommandFailed {
                command_id,
                exit_code,
                message,
                ..
            } => self.transcript.push(format!(
                "COMMAND  failed · {command_id} · exit {} · {message}",
                exit_code.map_or_else(|| "unknown".to_owned(), |code| code.to_string())
            )),
            LbeEvent::CommandDetached {
                command_id,
                tool_call_id,
            } => self
                .transcript
                .push(format!("COMMAND  detached · {command_id} · {tool_call_id}")),
            LbeEvent::DetachedCommandProgress { command_id, text } => self
                .transcript
                .push(format!("  DETACHED {command_id} · {text}")),
            LbeEvent::DetachedCommandCompleted {
                command_id,
                exit_code,
            } => self.transcript.push(format!(
                "DETACHED COMMAND  completed · {command_id} · exit {exit_code}"
            )),
            LbeEvent::DetachedLogAvailable { command_id } => self
                .transcript
                .push(format!("DETACHED COMMAND  log available · {command_id}")),
            LbeEvent::ContextCompactionSuggested => {
                self.snapshot.compaction_state = CompactionState::Suggested;
                self.transcript
                    .push("CONTEXT  compaction suggested (mock only)".to_owned());
            }
            LbeEvent::ContextCompactionStarted => {
                self.snapshot.compaction_state = CompactionState::Running;
                self.transcript
                    .push("CONTEXT  compaction started (mock only)".to_owned());
            }
            LbeEvent::ContextCompactionCompleted { context_used } => {
                self.snapshot.context_used = context_used;
                self.snapshot.compaction_state = CompactionState::Completed;
                self.transcript.push(format!(
                    "CONTEXT  compaction completed · {context_used}/{}",
                    self.snapshot.context_capacity
                ));
            }
            LbeEvent::ContextCompactionFailed { message } => {
                self.snapshot.compaction_state = CompactionState::Failed;
                self.transcript
                    .push(format!("CONTEXT  compaction failed · {message}"));
            }
            LbeEvent::RetryScheduled {
                retry_count,
                retry_limit,
            } => {
                self.snapshot.retry_count = retry_count;
                self.snapshot.retry_limit = retry_limit;
                self.transcript
                    .push(format!("RETRY  scheduled · {retry_count}/{retry_limit}"));
            }
            LbeEvent::RetryLimitReached { retry_limit } => {
                self.snapshot.retry_count = retry_limit;
                self.transcript
                    .push(format!("RETRY  limit reached · {retry_limit}"));
            }
            LbeEvent::TimeoutWarning {
                elapsed_seconds,
                timeout_seconds,
            } => {
                self.snapshot.elapsed_seconds = elapsed_seconds;
                self.snapshot.timeout_seconds = timeout_seconds;
                self.transcript.push(format!(
                    "TIMEOUT  warning · {elapsed_seconds}s/{timeout_seconds}s"
                ));
            }
            LbeEvent::TimedOut { timeout_seconds } => {
                self.snapshot.elapsed_seconds = timeout_seconds;
                self.snapshot.timeout_seconds = timeout_seconds;
                self.snapshot.session_state = SessionStatus::Failed;
                self.transcript
                    .push(format!("TIMEOUT  reached · {timeout_seconds}s"));
            }
            LbeEvent::DiagnosticsUpdated { checks } => {
                self.snapshot.diagnostics = checks;
            }
            LbeEvent::AssistantTextDelta { text } => {
                self.transcript.push(format!("lbe agent  {text}"));
            }
            LbeEvent::ProposalCreated {
                approval_id,
                proposal,
            } => {
                self.phase = Phase::AwaitingApproval {
                    approval_id,
                    proposal,
                };
            }
            LbeEvent::PlanUpdated { text } => {
                self.transcript.push(format!("PLAN  {text}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::AuditVerdict { verdict } => {
                self.transcript.push(format!("AUDIT  {verdict}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::ToolRequested {
                tool_call_id,
                tool_name,
                input_summary,
                risk,
            } => {
                self.transcript.push(format!(
                    "TOOL  REQUESTED · {tool_name} · {} · {input_summary} · {tool_call_id}",
                    risk.label()
                ));
            }
            LbeEvent::ToolStarted { tool_call_id } => {
                self.transcript
                    .push(format!("TOOL  STARTED · {tool_call_id}"));
            }
            LbeEvent::ToolOutputDelta { tool_call_id, text } => {
                self.transcript
                    .push(format!("  TOOL {tool_call_id} · {text}"));
            }
            LbeEvent::ToolCompleted {
                tool_call_id,
                evidence_ref,
            } => {
                let evidence = evidence_ref.as_deref().unwrap_or("no evidence ref");
                self.transcript
                    .push(format!("TOOL  COMPLETED · {tool_call_id} · {evidence}"));
            }
            LbeEvent::ToolFailed {
                tool_call_id,
                message,
            } => {
                self.transcript
                    .push(format!("TOOL  FAILED · {tool_call_id} · {message}"));
            }
            LbeEvent::ExecutionStarted { execution_id } => {
                if let Phase::AwaitingApproval { proposal, .. } = &self.phase {
                    self.transcript.push(format!("lbe runtime  {proposal}"));
                }
                self.transcript
                    .push(format!("lbe runtime  EXECUTION STARTED · {execution_id}"));
                self.phase = Phase::Running;
            }
            LbeEvent::AgentRequestedCompletion { execution_id } => {
                self.transcript
                    .push(format!("AGENT  requested completion · {execution_id}"));
            }
            LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id,
            } => {
                let receipt = receipt_id.as_deref().unwrap_or("no receipt");
                self.transcript.push(format!(
                    "EXECUTION  completed · {execution_id} · receipt {receipt}"
                ));
            }
            LbeEvent::ValidationStarted { execution_id } => {
                self.transcript
                    .push(format!("VALIDATION  started · {execution_id}"));
            }
            LbeEvent::ValidationCompleted { status, result } => {
                self.transcript
                    .push(format!("VALIDATION  {} · {result}", status.label()));
            }
            LbeEvent::LbeCompletionAccepted {
                execution_id,
                receipt_id,
            } => {
                let receipt = receipt_id.as_deref().unwrap_or("no receipt");
                self.transcript.push(format!(
                    "LBE RUNTIME  COMPLETION ACCEPTED · {execution_id} · receipt {receipt}"
                ));
                self.phase = Phase::Completed;
            }
            LbeEvent::ExecutionRejected => {
                self.transcript
                    .push("LBE RUNTIME  REJECTED · no execution occurred.".to_owned());
                self.phase = Phase::Rejected;
            }
            LbeEvent::SessionMemoryIndexed {
                session_id,
                session_hash,
            } => {
                self.snapshot.memory.current_session_hash = Some(session_hash.clone());
                self.snapshot.memory.indexed_sessions = self.snapshot.memory.indexed_sessions.max(1);
                self.transcript.push(format!(
                    "MEMORY  indexed session · {session_id} · {session_hash}"
                ));
            }
            LbeEvent::MemoryRecallStarted { query } => {
                self.snapshot.memory.last_recall_query = Some(query.clone());
                self.transcript
                    .push(format!("MEMORY  recall started · {query}"));
            }
            LbeEvent::MemoryRecallResult { query, records } => {
                self.snapshot.memory.last_recall_query = Some(query.clone());
                self.snapshot.memory.indexed_memories = self.snapshot.memory.indexed_memories.max(records.len());
                self.snapshot.memory.recent_records = records.clone();
                self.transcript.push(format!(
                    "MEMORY  recall result · {query} · {} record(s)",
                    records.len()
                ));
            }
            LbeEvent::MemoryRecallEmpty { query } => {
                self.snapshot.memory.last_recall_query = Some(query.clone());
                self.snapshot.memory.recent_records.clear();
                self.transcript
                    .push(format!("MEMORY  recall empty · {query}"));
            }
            LbeEvent::MemoryCheckpointCreated {
                checkpoint_id,
                memory_count,
            } => {
                self.transcript.push(format!(
                    "MEMORY  checkpoint created · {checkpoint_id} · {memory_count} record(s)"
                ));
            }
            LbeEvent::BrowserChatAttached {
                browser_session_id,
                provider,
            } => {
                self.snapshot.browser_chat.provider = Some(provider.clone());
                self.snapshot.browser_chat.browser_session_id = Some(browser_session_id.clone());
                self.snapshot.browser_chat.lbe_session_id = self.snapshot.session_id.clone();
                self.snapshot.browser_chat.attached = true;
                self.snapshot.browser_chat.status = "Waiting for browser assistant".to_owned();
                self.transcript.push(format!(
                    "BROWSER  attached · {} · {browser_session_id}",
                    provider.label()
                ));
            }
            LbeEvent::BrowserChatDetached { browser_session_id } => {
                self.snapshot.browser_chat.attached = false;
                self.snapshot.browser_chat.status = "Detached".to_owned();
                self.transcript
                    .push(format!("BROWSER  detached · {browser_session_id}"));
            }
            LbeEvent::BrowserMessageReceived {
                browser_message_id,
                content,
            } => {
                self.snapshot.browser_chat.last_browser_message_id = Some(browser_message_id.clone());
                self.snapshot.browser_chat.last_lbe_turn_id = self.snapshot.turn_id.clone();
                self.snapshot.browser_chat.status = "Browser message received".to_owned();
                self.transcript
                    .push(format!("BROWSER  message · {browser_message_id} · {content}"));
            }
            LbeEvent::BrowserToolRequested {
                browser_message_id,
                tool_name,
                input_summary,
            } => {
                self.snapshot.browser_chat.last_browser_message_id = Some(browser_message_id.clone());
                self.snapshot.browser_chat.status = "Tool request routed through LBE".to_owned();
                self.transcript.push(format!(
                    "BROWSER  tool requested · {browser_message_id} · {tool_name} · {input_summary}"
                ));
            }
            LbeEvent::BrowserToolResultDelivered {
                browser_message_id,
                tool_call_id,
                receipt_id,
                evidence_ref,
            } => {
                self.snapshot.browser_chat.last_browser_message_id = Some(browser_message_id.clone());
                self.snapshot.browser_chat.last_receipt_id = receipt_id.clone();
                self.snapshot.browser_chat.last_evidence_ref = evidence_ref.clone();
                self.snapshot.browser_chat.status = "LBE result delivered to browser".to_owned();
                self.transcript.push(format!(
                    "BROWSER  tool result delivered · {browser_message_id} · {tool_call_id}"
                ));
            }
            LbeEvent::BrowserChatConnectionLost => {
                self.snapshot.browser_chat.attached = false;
                self.snapshot.browser_chat.status = "Connection lost; fail closed".to_owned();
                self.transcript
                    .push("BROWSER  connection lost · fail closed".to_owned());
            }
            LbeEvent::BrowserChatReconnected { browser_session_id } => {
                self.snapshot.browser_chat.browser_session_id = Some(browser_session_id.clone());
                self.snapshot.browser_chat.attached = true;
                self.snapshot.browser_chat.status = "Reconnected".to_owned();
                self.transcript
                    .push(format!("BROWSER  reconnected · {browser_session_id}"));
            }
        }
    }

    pub(crate) fn intro_elapsed(&self, now: Instant) -> Duration {
        now.saturating_duration_since(self.intro_started_at)
    }

    pub(crate) fn next_intro_wake(&self, now: Instant) -> Option<Duration> {
        if !self.transcript.is_empty() { return None; }
        let elapsed = self.intro_elapsed(now);
        for milestone in [OUTER_REVEAL, FRAME_REVEAL, BRACKETS_REVEAL, BAR_REVEAL, SLOGAN_REVEAL, BAR_BLINK_START] {
            if elapsed < milestone { return Some(milestone - elapsed); }
        }
        let blink_elapsed = elapsed - BAR_BLINK_START;
        let remainder = blink_elapsed.as_millis() % BAR_BLINK_HALF_PERIOD.as_millis();
        Some(Duration::from_millis((BAR_BLINK_HALF_PERIOD.as_millis() - remainder) as u64))
    }

    pub(crate) fn next_wake(&self, now: Instant) -> Option<Duration> {
        let intro_wake = self.next_intro_wake(now);
        let runtime_wake = None;
        match (intro_wake, runtime_wake) {
            (Some(intro), Some(runtime)) => Some(intro.min(runtime)),
            (Some(intro), None) => Some(intro),
            (None, Some(runtime)) => Some(runtime),
            (None, None) => None,
        }
    }
}
