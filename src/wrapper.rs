use std::{collections::VecDeque, time::{Duration, Instant}};
use crate::{
    browser_chat::BrowserChatProvider,
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
struct ScheduledLbeEvent { due_at: Instant, event: LbeEvent }

#[derive(Debug)]
pub(crate) struct MockLbeWrapper {
    snapshot: LbeSnapshot,
    scheduled: VecDeque<ScheduledLbeEvent>,
    pending_approval_id: Option<String>,
}

impl MockLbeWrapper {
    fn emit(&mut self, event: LbeEvent) {
        self.scheduled.push_back(ScheduledLbeEvent { due_at: Instant::now(), event });
    }
    fn emit_snapshot(&mut self) {
        self.emit(LbeEvent::SnapshotUpdated { snapshot: self.snapshot() });
    }
}

impl Default for MockLbeWrapper {
    fn default() -> Self {
        Self { snapshot: LbeSnapshot::default(), scheduled: VecDeque::new(), pending_approval_id: None }
    }
}
impl LbeWrapper for MockLbeWrapper {
    fn snapshot(&self) -> LbeSnapshot { self.snapshot.clone() }

    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError> {
        match request {
            UserRequest::SubmitTask { intent, mode } => match mode {
                AgentMode::Regular => {
                    let approval_id = "apr_mock_7f31".to_owned();
                    self.pending_approval_id = Some(approval_id.clone());
                    self.emit(LbeEvent::ProposalCreated { approval_id, proposal: format!("Proposed: {intent}") });
                    self.snapshot.session_state = SessionStatus::WaitingForApproval;
                    self.emit(LbeEvent::SessionStatusUpdated { status: self.snapshot.session_state });
                }
                AgentMode::Plan => self.emit(LbeEvent::PlanUpdated { text: format!("Mock plan: investigate {intent}; no execution.") }),
                AgentMode::Audit => self.emit(LbeEvent::AuditVerdict { verdict: "INSUFFICIENT_EVIDENCE · mock runtime not connected to LBE guards.".to_owned() }),
            },
            UserRequest::Continue { session_id, message } => {
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return Err(LbeError { message: "session ID is not active in the mock runtime".to_owned() });
                }
                self.snapshot.turn_id = Some("turn_mock_1".to_owned());
                self.emit_snapshot();
                self.emit(LbeEvent::AssistantTextDelta { text: format!("Mock follow-up received: {message}") });
            }
            UserRequest::RefreshProviderCatalog => {
                self.emit(LbeEvent::ProviderDiscoveryStarted);
                let providers = self.snapshot.providers.clone();
                self.emit(LbeEvent::ProviderCatalogDiscovered { providers: providers.clone() });
                for p in &providers {
                    self.emit(LbeEvent::ProviderValidationStarted { provider_id: p.provider_id });
                    self.emit(LbeEvent::ProviderAuthStateUpdated { provider_id: p.provider_id, auth_state: p.auth_state });
                    self.emit(LbeEvent::ProviderHealthUpdated { provider_id: p.provider_id, health: p.health });
                    self.emit(LbeEvent::ProviderValidationCompleted { provider_id: p.provider_id });
                }
                self.emit(LbeEvent::ModelCatalogDiscovered { models: self.snapshot.models.clone() });
                let discovered = providers.iter().map(|p| p.provider_id).collect::<Vec<_>>();
                self.emit(LbeEvent::ProviderDiscoveryCompleted { providers: discovered });
            }
            UserRequest::CompactContext => {
                if !self.snapshot.compaction_available {
                    self.emit(LbeEvent::ContextCompactionFailed { message: "Context compaction unavailable in mock runtime.".to_owned() });
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
                self.emit(LbeEvent::DiagnosticsUpdated { checks: self.snapshot.diagnostics.clone() });
            }
            UserRequest::Approve { approval_id } => {
                if self.pending_approval_id.as_deref() != Some(approval_id.as_str()) {
                    return Err(LbeError { message: "approval ID is not pending in the mock runtime".to_owned() });
                }
                self.pending_approval_id = None;
                self.scheduled.clear();
                let execution_id = "exec_mock_7f31".to_owned();
                self.snapshot.session_state = SessionStatus::Running;
                self.emit(LbeEvent::ExecutionStarted { execution_id: execution_id.clone() });
self.scheduled.extend([
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(250), event: LbeEvent::CheckpointCreated { checkpoint: CheckpointDescriptor { checkpoint_id: "chk_mock_before_exec".to_owned(), created_at: "mock-time".to_owned(), workspace_revision: "mock-rev-7f31".to_owned(), changed_files: vec!["rust/main.rs".to_owned()] } } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(300), event: LbeEvent::ToolRequested { tool_call_id: "tool_mock_workspace".to_owned(), tool_name: "workspace.inspect".to_owned(), input_summary: "active workspace".to_owned(), risk: ToolRisk::ReadOnly } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(350), event: LbeEvent::ToolStarted { tool_call_id: "tool_mock_workspace".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(400), event: LbeEvent::CommandStarted { tool_call_id: "tool_mock_workspace".to_owned(), command_id: "cmd_mock_check".to_owned(), command_summary: "cargo check (mock only)".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(450), event: LbeEvent::CommandStdoutDelta { tool_call_id: "tool_mock_workspace".to_owned(), command_id: "cmd_mock_check".to_owned(), text: "Checking mock workspace...".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(500), event: LbeEvent::CommandStderrDelta { tool_call_id: "tool_mock_workspace".to_owned(), command_id: "cmd_mock_check".to_owned(), text: "mock stderr is display-only".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(550), event: LbeEvent::CommandCompleted { tool_call_id: "tool_mock_workspace".to_owned(), command_id: "cmd_mock_check".to_owned(), exit_code: 0 } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(600), event: LbeEvent::ToolOutputDelta { tool_call_id: "tool_mock_workspace".to_owned(), text: "Mock workspace inspection completed.".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(650), event: LbeEvent::ToolCompleted { tool_call_id: "tool_mock_workspace".to_owned(), evidence_ref: Some("evidence_mock_7f31".to_owned()) } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(700), event: LbeEvent::AgentRequestedCompletion { execution_id: execution_id.clone() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(750), event: LbeEvent::ExecutionCompleted { execution_id: execution_id.clone(), receipt_id: Some("rcpt_demo_7f31".to_owned()) } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(800), event: LbeEvent::ValidationStarted { execution_id: execution_id.clone() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(900), event: LbeEvent::ValidationCompleted { status: ValidationStatus::Passed, result: "Focused validation complete.".to_owned() } },
                    ScheduledLbeEvent { due_at: now + Duration::from_millis(950), event: LbeEvent::LbeCompletionAccepted { execution_id, receipt_id: Some("rcpt_demo_7f31".to_owned()) } },
                ]);
            }
            UserRequest::Reject { approval_id } => {
                if self.pending_approval_id.as_deref() != Some(approval_id.as_str()) {
                    return Err(LbeError { message: "approval ID is not pending in the mock runtime".to_owned() });
                }
                self.pending_approval_id = None;
                self.scheduled.clear();
                self.snapshot.session_state = SessionStatus::WaitingForInput;
                self.emit(LbeEvent::ExecutionRejected);
                self.emit(LbeEvent::SessionStatusUpdated { status: self.snapshot.session_state });
            }
            UserRequest::SelectModel { model } => {
                let in_catalog = self.snapshot.models.iter().any(|c| c.provider_id == model.provider_id && c.model_id == model.model_id);
                if !in_catalog { return Err(LbeError { message: format!("model {} is not in the discovered model catalog", model.model_id) }); }
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
                self.snapshot.memory.indexed_sessions = self.snapshot.memory.indexed_sessions.max(1);
                self.snapshot.memory.indexed_memories = self.snapshot.memory.indexed_memories.max(records.len());
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
                        message: "browser chat bridge is detached; refusing direct browser fallback".to_owned(),
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
                self.scheduled.clear();
                self.snapshot.session_state = SessionStatus::Aborted;
                self.emit(LbeEvent::ExecutionRejected);
                self.emit(LbeEvent::SessionStatusUpdated { status: self.snapshot.session_state });
            }
        }
        Ok(())
    }

    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError> {
        if self.scheduled.front().is_some_and(|s| s.due_at <= now) {
            return Ok(self.scheduled.pop_front().map(|s| s.event));
        }
        Ok(None)
    }

    fn next_wake(&self, now: Instant) -> Option<Duration> {
        self.scheduled.front().map(|s| s.due_at.saturating_duration_since(now))
    }
}
