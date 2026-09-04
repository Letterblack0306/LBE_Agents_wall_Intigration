use std::time::{Duration, Instant};

use ratatui::termina::event::{KeyCode, KeyEvent, KeyEventKind, Modifiers};

use crate::{
    browser_chat::BrowserChatProvider,
    events::{LbeEvent, ValidationStatus},
    requests::{LbeError, UserRequest},
    types::*,
    wrapper::LbeWrapper,
};

fn submit_trace(message: String) {
    if std::env::var_os("LBE_SUBMIT_TRACE").is_some() {
        eprintln!("[LBE_SUBMIT_TRACE] {message}");
    }
}

// ---------------------------------------------------------------------------
// App — the central UI state machine
// ---------------------------------------------------------------------------

pub(crate) struct App {
    pub(crate) input: String,
    pub(crate) transcript: Vec<String>,
    pub(crate) activity_log: Vec<String>,
    pub(crate) phase: Phase,
    pub(crate) agent_mode: AgentMode,
    pub(crate) show_shortcuts: bool,
    pub(crate) show_command_palette: bool,
    pub(crate) command_palette_index: usize,
    pub(crate) panel: Option<MockPanel>,
    pub(crate) input_history: Vec<String>,
    pub(crate) history_index: Option<usize>,
    pub(crate) should_quit: bool,
    pub(crate) snapshot: LbeSnapshot,
    pub(crate) mcp_schema_version: u64,
    pub(crate) mcp_integrations: Vec<McpIntegration>,
    pub(crate) active_execution_id: Option<String>,
    pub(crate) last_execution_evidence_ref: Option<String>,
    pub(crate) last_execution_receipt_id: Option<String>,
    pub(crate) last_process_command_id: Option<String>,
    pub(crate) last_process_tool_call_id: Option<String>,
    pub(crate) last_process_state: Option<String>,
    pub(crate) last_process_activity: Option<String>,
    pub(crate) last_process_detail: Vec<String>,
    pub(crate) last_process_exit_code: Option<i32>,
    pub(crate) last_process_log_available: bool,
    pub(crate) last_tool_name: Option<String>,
    pub(crate) last_tool_call_id: Option<String>,
    pub(crate) last_tool_input: Option<String>,
    pub(crate) last_tool_risk: Option<String>,
    pub(crate) last_tool_state: Option<String>,
    pub(crate) last_authorization_operation_id: Option<String>,
    pub(crate) last_authorization_approval_id: Option<String>,
    pub(crate) last_authorization_capability: Option<String>,
    pub(crate) last_authorization_verdict: Option<String>,
    pub(crate) last_authorization_rationale: Option<String>,
    pub(crate) evidence_records: Vec<EvidenceProjection>,
    pub(crate) receipt_records: Vec<ReceiptProjection>,
    pub(crate) audit_findings: Vec<AuditFinding>,
    pub(crate) audit_affected_files: Vec<String>,
    pub(crate) audit_tool_trace: Vec<String>,
    pub(crate) audit_verdict: Option<String>,
    pub(crate) audit_scroll: usize,
    pub(crate) workspace_listing: Option<WorkspaceListing>,
    pub(crate) workspace_file: Option<WorkspaceFile>,
    pub(crate) workspace_patch: Option<WorkspacePatch>,
    pub(crate) pending_patch: Option<PendingPatch>,
    pub(crate) workspace_file_scroll: usize,
    /// Selected row in the Agent Wall workspace listing.
    pub(crate) workspace_cursor: usize,
    /// `None` follows the newest transcript entry; `Some` is an explicit offset.
    pub(crate) transcript_scroll: Option<usize>,
    pub(crate) provider_picker_index: usize,
    pub(crate) model_picker_index: usize,
    pub(crate) session_picker_index: usize,
    pub(crate) checkpoint_changed_files: Vec<String>,
    pub(crate) checkpoint_restore_status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AuditFinding {
    pub(crate) category: String,
    pub(crate) detail: String,
}

pub(crate) fn command_palette_commands() -> &'static [(&'static str, &'static str)] {
    &[
        ("/provider", "refresh and inspect providers"),
        ("/models", "choose a model"),
        ("/sessions", "list and resume sessions"),
        ("/mcp", "refresh MCP registry"),
        ("/tools", "inspect the last tool projection"),
        ("/processes", "inspect process activity"),
        ("/activity", "show runtime event activity"),
        ("/evidence", "show evidence references"),
        ("/receipts", "show ToolReceipts"),
        ("/changes", "show workspace changes"),
        ("/memory", "recall recent session memory"),
        ("/doctor", "run diagnostics"),
        ("/help", "show keyboard and command help"),
    ]
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PendingPatch {
    pub(crate) operation_id: Option<String>,
    pub(crate) approval_id: Option<String>,
    pub(crate) path: String,
    pub(crate) expected_sha256: String,
    pub(crate) content: String,
}

impl Default for App {
    fn default() -> Self {
        Self {
            input: String::new(),
            transcript: Vec::new(),
            activity_log: Vec::new(),
            phase: Phase::Welcome,
            agent_mode: AgentMode::Regular,
            show_shortcuts: false,
            show_command_palette: false,
            command_palette_index: 0,
            panel: None,
            input_history: Vec::new(),
            history_index: None,
            should_quit: false,
            snapshot: LbeSnapshot::default(),
            mcp_schema_version: 0,
            mcp_integrations: Vec::new(),
            active_execution_id: None,
            last_execution_evidence_ref: None,
            last_execution_receipt_id: None,
            last_process_command_id: None,
            last_process_tool_call_id: None,
            last_process_state: None,
            last_process_activity: None,
            last_process_detail: Vec::new(),
            last_process_exit_code: None,
            last_process_log_available: false,
            last_tool_name: None,
            last_tool_call_id: None,
            last_tool_input: None,
            last_tool_risk: None,
            last_tool_state: None,
            last_authorization_operation_id: None,
            last_authorization_approval_id: None,
            last_authorization_capability: None,
            last_authorization_verdict: None,
            last_authorization_rationale: None,
            evidence_records: Vec::new(),
            receipt_records: Vec::new(),
            audit_findings: Vec::new(),
            audit_affected_files: Vec::new(),
            audit_tool_trace: Vec::new(),
            audit_verdict: None,
            audit_scroll: 0,
            workspace_listing: None,
            workspace_file: None,
            workspace_patch: None,
            pending_patch: None,
            workspace_file_scroll: 0,
            workspace_cursor: 0,
            transcript_scroll: None,
            provider_picker_index: 0,
            model_picker_index: 0,
            session_picker_index: 0,
            checkpoint_changed_files: Vec::new(),
            checkpoint_restore_status: None,
        }
    }
}

impl App {
    fn retain_latest_process_detail(&mut self) {
        const PROCESS_DETAIL_LIMIT: usize = 32;
        let excess = self
            .last_process_detail
            .len()
            .saturating_sub(PROCESS_DETAIL_LIMIT);
        if excess > 0 {
            self.last_process_detail.drain(..excess);
        }
    }

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
        wrapper: &mut (impl LbeWrapper + ?Sized),
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
        if key.code == KeyCode::Char('p')
            && key.modifiers.contains(Modifiers::CONTROL)
            && self.input.is_empty()
        {
            self.show_command_palette = !self.show_command_palette;
            self.show_shortcuts = false;
            self.panel = None;
            return;
        }
        if self.show_command_palette {
            match key.code {
                KeyCode::Escape => self.show_command_palette = false,
                KeyCode::Up => self.move_command_palette(-1),
                KeyCode::Down => self.move_command_palette(1),
                KeyCode::Enter => self.execute_command_palette(wrapper),
                _ => {}
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
            KeyCode::Enter
                if key
                    .modifiers
                    .intersects(Modifiers::SHIFT | Modifiers::CONTROL) =>
            {
                if !matches!(self.phase, Phase::Running { .. }) {
                    self.input.push('\n');
                }
            }
            KeyCode::Enter => self.submit_or_approve(wrapper, now),
            KeyCode::Function(2) if self.input.is_empty() => {
                self.handle_command("/provider", wrapper)
            }
            KeyCode::Function(3) if self.input.is_empty() => self.handle_command("/model", wrapper),
            KeyCode::Char('c')
                if matches!(self.panel, Some(MockPanel::Undo | MockPanel::Changes)) =>
            {
                self.compare_checkpoint(wrapper)
            }
            KeyCode::Char('r') if self.panel == Some(MockPanel::Undo) => {
                self.restore_checkpoint(wrapper)
            }
            KeyCode::Up if self.panel == Some(MockPanel::Model) => self.move_model_picker(-1),
            KeyCode::Down if self.panel == Some(MockPanel::Model) => self.move_model_picker(1),
            KeyCode::Up if self.panel == Some(MockPanel::Provider) => self.move_provider_picker(-1),
            KeyCode::Down if self.panel == Some(MockPanel::Provider) => {
                self.move_provider_picker(1)
            }
            KeyCode::Up if self.panel == Some(MockPanel::Session) => self.move_session_picker(-1),
            KeyCode::Down if self.panel == Some(MockPanel::Session) => self.move_session_picker(1),
            KeyCode::Up
                if self.input.is_empty()
                    && self.panel.is_none()
                    && self.workspace_file.is_none()
                    && self.workspace_listing.is_some() =>
            {
                self.move_workspace_cursor(-1)
            }
            KeyCode::Down
                if self.input.is_empty()
                    && self.panel.is_none()
                    && self.workspace_file.is_none()
                    && self.workspace_listing.is_some() =>
            {
                self.move_workspace_cursor(1)
            }
            KeyCode::PageUp if self.workspace_file.is_some() => self.scroll_workspace_file(-10),
            KeyCode::PageDown if self.workspace_file.is_some() => self.scroll_workspace_file(10),
            KeyCode::PageUp if self.agent_mode == AgentMode::Audit => self.scroll_audit(-10),
            KeyCode::PageDown if self.agent_mode == AgentMode::Audit => self.scroll_audit(10),
            KeyCode::Home if self.workspace_file.is_some() => self.workspace_file_scroll = 0,
            KeyCode::Home if self.agent_mode == AgentMode::Audit => self.audit_scroll = 0,
            KeyCode::End if self.workspace_file.is_some() => {
                self.workspace_file_scroll = self.workspace_file_end()
            }
            KeyCode::End if self.agent_mode == AgentMode::Audit => self.audit_scroll = usize::MAX,
            KeyCode::Up if self.workspace_file.is_some() => self.scroll_workspace_file(-1),
            KeyCode::Down if self.workspace_file.is_some() => self.scroll_workspace_file(1),
            KeyCode::Up if self.agent_mode == AgentMode::Audit => self.scroll_audit(-1),
            KeyCode::Down if self.agent_mode == AgentMode::Audit => self.scroll_audit(1),
            KeyCode::PageUp => self.scroll_transcript(-10),
            KeyCode::PageDown => self.scroll_transcript(10),
            KeyCode::Home => self.transcript_scroll = Some(0),
            KeyCode::End => self.transcript_scroll = None,
            KeyCode::Up if self.input.is_empty() && !self.transcript.is_empty() => {
                self.scroll_transcript(-1)
            }
            KeyCode::Down if self.input.is_empty() && !self.transcript.is_empty() => {
                self.scroll_transcript(1)
            }
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

    pub(crate) fn submit_or_approve(
        &mut self,
        wrapper: &mut (impl LbeWrapper + ?Sized),
        now: Instant,
    ) {
        submit_trace(format!(
            "app.submit_or_approve entered phase={:?} input_len={} session={}",
            self.phase,
            self.input.len(),
            self.snapshot.session_id.as_deref().unwrap_or("none")
        ));
        if self.panel == Some(MockPanel::Model) {
            self.select_model(wrapper, now);
            return;
        }
        if self.panel == Some(MockPanel::Provider) {
            self.validate_selected_provider(wrapper, now);
            return;
        }
        if self.panel == Some(MockPanel::Session) && !self.snapshot.sessions.is_empty() {
            self.resume_selected_session(wrapper, now);
            return;
        }
        if self.input.trim().is_empty()
            && self.panel.is_none()
            && !self.show_shortcuts
            && !matches!(
                self.phase,
                Phase::PatchReview { .. } | Phase::AwaitingApproval { .. } | Phase::Running
            )
            && self.workspace_file.is_none()
        {
            if self.open_workspace_cursor(wrapper, now) {
                return;
            }
        }
        match &self.phase {
            Phase::PatchReview {
                path,
                expected_sha256,
                replacement_content,
            } => {
                self.pending_patch = Some(PendingPatch {
                    operation_id: None,
                    approval_id: None,
                    path: path.clone(),
                    expected_sha256: expected_sha256.clone(),
                    content: replacement_content.clone(),
                });
                self.apply_wrapper_result(wrapper.submit(
                    UserRequest::RequestAuthorization {
                        capability: "modify".to_owned(),
                    },
                    now,
                ));
            }
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
                submit_trace(format!(
                    "app sending UserRequest::SubmitTask intent_len={} mode={:?}",
                    task.len(),
                    self.agent_mode
                ));
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
    pub(crate) fn dismiss_or_reject(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized)) {
        if self.panel.is_some() || self.show_shortcuts {
            self.panel = None;
            self.show_shortcuts = false;
            return;
        }
        if matches!(self.phase, Phase::PatchReview { .. }) {
            self.pending_patch = None;
            self.phase = Phase::Welcome;
            self.transcript
                .push("PATCH  review cancelled; no mutation requested".to_owned());
            return;
        }
        if let Phase::AwaitingApproval { approval_id, .. } = &self.phase {
            self.pending_patch = None;
            self.apply_wrapper_result(wrapper.submit(
                UserRequest::Reject {
                    approval_id: approval_id.clone(),
                },
                Instant::now(),
            ));
        }
    }

    pub(crate) fn set_mode(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized), mode: AgentMode) {
        self.apply_wrapper_result(wrapper.submit(UserRequest::SetMode { mode }, Instant::now()));
    }

    pub(crate) fn apply_wrapper_result(&mut self, result: Result<(), LbeError>) {
        if let Err(error) = result {
            submit_trace(format!(
                "app received synchronous wrapper error: {}",
                error.message
            ));
            self.transcript
                .push(format!("LBE WRAPPER ERROR  {}", error.message));
        }
    }
    pub(crate) fn handle_command(
        &mut self,
        command: &str,
        wrapper: &mut (impl LbeWrapper + ?Sized),
    ) {
        let mut parts = command.splitn(2, char::is_whitespace);
        let command_name = parts.next().unwrap_or(command).to_ascii_lowercase();
        let argument = parts.next().unwrap_or("").trim();
        self.show_shortcuts = false;
        self.show_command_palette = false;
        self.panel = match command_name.as_str() {
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
            "/provider-config" => {
                let provider_id = match argument.to_ascii_lowercase().as_str() {
                    "gemini" | "google" => Some(ProviderId::Gemini),
                    "openai" => Some(ProviderId::OpenAi),
                    "anthropic" => Some(ProviderId::Anthropic),
                    _ => None,
                };
                if let Some(provider_id) = provider_id {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ConfigureProvider {
                            provider_id,
                            base_url: None,
                            credential_ref: Some("opaque-ref".to_owned()),
                        },
                        Instant::now(),
                    ));
                } else {
                    self.transcript.push(
                        "SYSTEM  usage: /provider-config <gemini|openai|anthropic>".to_owned(),
                    );
                }
                Some(MockPanel::Provider)
            }
            "/provider-validate" => {
                let provider_id = match argument.to_ascii_lowercase().as_str() {
                    "gemini" | "google" => Some(ProviderId::Gemini),
                    "openai" => Some(ProviderId::OpenAi),
                    "anthropic" => Some(ProviderId::Anthropic),
                    _ => None,
                };
                if let Some(provider_id) = provider_id {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ValidateProvider { provider_id },
                        Instant::now(),
                    ));
                } else {
                    self.transcript.push(
                        "SYSTEM  usage: /provider-validate <gemini|openai|anthropic>".to_owned(),
                    );
                }
                Some(MockPanel::Provider)
            }
            "/provider-remove" => {
                let provider_id = match argument.to_ascii_lowercase().as_str() {
                    "gemini" | "google" => Some(ProviderId::Gemini),
                    "openai" => Some(ProviderId::OpenAi),
                    "anthropic" => Some(ProviderId::Anthropic),
                    _ => None,
                };
                if let Some(provider_id) = provider_id {
                    self.apply_wrapper_result(
                        wrapper.submit(UserRequest::RemoveProvider { provider_id }, Instant::now()),
                    );
                } else {
                    self.transcript.push(
                        "SYSTEM  usage: /provider-remove <gemini|openai|anthropic>".to_owned(),
                    );
                }
                Some(MockPanel::Provider)
            }
            "/model" | "/models" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RefreshProviderCatalog, Instant::now()),
                );
                self.model_picker_index = self
                    .snapshot
                    .models
                    .iter()
                    .position(|model| {
                        self.snapshot
                            .selected_model
                            .as_ref()
                            .is_some_and(|selected| {
                                selected.provider_id == model.provider_id
                                    && selected.model_id == model.model_id
                            })
                    })
                    .unwrap_or(0);
                Some(MockPanel::Model)
            }
            "/mcp" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RefreshMcpRegistry, Instant::now()),
                );
                Some(MockPanel::Mcp)
            }
            "/tools" => Some(MockPanel::Tools),
            "/processes" => Some(MockPanel::Processes),
            "/history" => Some(MockPanel::History),
            "/session" => Some(MockPanel::Session),
            "/sessions" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::ListSessions, Instant::now()),
                );
                Some(MockPanel::Session)
            }
            "/resume" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  /resume requires a session ID.".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ResumeSession {
                            session_id: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/close" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  /close requires a session ID.".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::CloseSession {
                            session_id: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/evidence" => Some(MockPanel::Evidence),
            "/receipts" => Some(MockPanel::Receipts),
            "/activity" | "/timeline" => Some(MockPanel::Activity),
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
            "/browser-send" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /browser-send <message>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::SendBrowserMessage {
                            content: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                Some(MockPanel::Browser)
            }
            "/browser-continue" => {
                let mut browser_parts = argument.splitn(2, char::is_whitespace);
                let browser_session_id = browser_parts.next().unwrap_or("").trim();
                let message = browser_parts.next().unwrap_or("").trim();
                if browser_session_id.is_empty() || message.is_empty() {
                    self.transcript.push(
                        "SYSTEM  usage: /browser-continue <browser-session-id> <message>"
                            .to_owned(),
                    );
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ContinueBrowserSession {
                            browser_session_id: browser_session_id.to_owned(),
                            message: message.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                Some(MockPanel::Browser)
            }
            "/doctor" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::RunDiagnostics, Instant::now()),
                );
                Some(MockPanel::Doctor)
            }
            "/open" | "/read" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /open <relative-path>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::InspectWorkspace {
                            path: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/tree" | "/list" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /tree <relative-directory>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ListWorkspace {
                            path: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/glob" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /glob <relative-glob-pattern>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::GlobWorkspace {
                            pattern: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/find" | "/search" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /find <query>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::SearchWorkspace {
                            query: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/patch" => {
                let mut patch_parts = argument.splitn(3, char::is_whitespace);
                let path = patch_parts.next().unwrap_or("").trim();
                let expected_sha256 = patch_parts.next().unwrap_or("").trim();
                let content = patch_parts.next().unwrap_or("");
                if path.is_empty() || expected_sha256.is_empty() || content.is_empty() {
                    self.transcript.push(
                        "SYSTEM  usage: /patch <relative-path> <expected-sha256> <replacement-content>"
                            .to_owned(),
                    );
                } else {
                    self.phase = Phase::PatchReview {
                        path: path.to_owned(),
                        expected_sha256: expected_sha256.to_owned(),
                        replacement_content: content.to_owned(),
                    };
                    self.pending_patch = None;
                    self.transcript.push(format!(
                        "PATCH  review ready · {path} · Enter applies through Agent Wall · Esc cancels"
                    ));
                }
                None
            }
            "/run" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /run <registered-command-id>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::RunRegisteredProcess {
                            command_id: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/authorize" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /authorize <capability>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::RequestAuthorization {
                            capability: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                None
            }
            "/undo" => Some(MockPanel::Undo),
            "/checkpoints" => Some(MockPanel::Undo),
            "/diff" | "/changes" => Some(MockPanel::Changes),
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
            "/memory-checkpoint" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::CreateMemoryCheckpoint, Instant::now()),
                );
                Some(MockPanel::Memory)
            }
            "/memory-forget" => {
                if argument.is_empty() {
                    self.transcript
                        .push("SYSTEM  usage: /memory-forget <session-id>".to_owned());
                } else {
                    self.apply_wrapper_result(wrapper.submit(
                        UserRequest::ForgetSessionMemory {
                            session_id: argument.to_owned(),
                        },
                        Instant::now(),
                    ));
                }
                Some(MockPanel::Memory)
            }
            "/clear" => {
                self.transcript.clear();
                self.transcript_scroll = None;
                None
            }
            "/new" => {
                self.apply_wrapper_result(
                    wrapper.submit(UserRequest::StartSession, Instant::now()),
                );
                None
            }
            "/quit" => {
                self.should_quit = true;
                None
            }
            _ => {
                self.transcript.push(format!(
                    "SYSTEM  unsupported command: {command_name}; use /help."
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

    fn record_activity(&mut self, event: &LbeEvent) {
        const ACTIVITY_LIMIT: usize = 64;
        let debug = format!("{event:?}");
        let label = debug
            .split(['{', '(', ' '])
            .next()
            .filter(|value| !value.is_empty())
            .unwrap_or("UnknownEvent");
        self.activity_log.push(label.to_owned());
        let excess = self.activity_log.len().saturating_sub(ACTIVITY_LIMIT);
        if excess > 0 {
            self.activity_log.drain(..excess);
        }
    }

    pub(crate) fn reduce_lbe_event(&mut self, event: LbeEvent) {
        self.record_activity(&event);
        match event {
            LbeEvent::WrapperError { message } => {
                submit_trace(format!(
                    "app projected WrapperError session={} turn={} message={}",
                    self.snapshot.session_id.as_deref().unwrap_or("none"),
                    self.snapshot.turn_id.as_deref().unwrap_or("none"),
                    message
                ));
                self.record_audit_finding("Runtime", message.clone());
                self.transcript
                    .push(format!("LBE WRAPPER ERROR  {message}"));
            }
            LbeEvent::SessionStarted { session_id } => {
                self.transcript.clear();
                self.transcript_scroll = None;
                self.panel = None;
                self.phase = Phase::Welcome;
                self.transcript
                    .push(format!("SESSION  started · {session_id}"));
            }
            LbeEvent::SessionRestored { session_id } => {
                self.transcript_scroll = None;
                self.panel = None;
                self.phase = Phase::Welcome;
                self.transcript
                    .push(format!("SESSION  restored · {session_id}"));
            }
            LbeEvent::SessionListUpdated { sessions } => {
                self.snapshot.sessions = sessions;
                self.session_picker_index = self
                    .session_picker_index
                    .min(self.snapshot.sessions.len().saturating_sub(1));
            }
            LbeEvent::SessionClosed { session_id } => {
                self.transcript
                    .push(format!("SESSION  closed · {session_id}"));
            }
            LbeEvent::RuntimeAttachmentUpdated {
                connection,
                runtime_id,
                runtime_mode,
                attached_client_count,
            } => {
                if connection != RuntimeConnection::Connected && self.pending_patch.is_some() {
                    self.pending_patch = None;
                    self.phase = Phase::Welcome;
                    self.transcript.push(
                        "PATCH  authorization cancelled · runtime is not connected".to_owned(),
                    );
                }
                self.snapshot.connection = connection;
                self.snapshot.runtime_id = runtime_id;
                self.snapshot.runtime_mode = runtime_mode;
                self.snapshot.attached_client_count = attached_client_count;
            }
            LbeEvent::SessionStatusUpdated {
                status,
                execution_id,
            } => {
                if execution_id.as_deref() != self.active_execution_id.as_deref()
                    && execution_id.is_some()
                {
                    return;
                }
                self.snapshot.session_state = status;
                if !matches!(self.phase, Phase::AwaitingApproval { .. })
                    || status != SessionStatus::WaitingForApproval
                {
                    self.phase = Phase::from_session_status(status);
                }
            }
            LbeEvent::SnapshotUpdated { snapshot } => {
                self.agent_mode = snapshot.active_mode;
                self.snapshot = snapshot;
            }
            LbeEvent::WorkspaceListingReady {
                path,
                entries,
                evidence_ref,
                receipt_id,
            } => {
                self.workspace_listing = Some(WorkspaceListing {
                    path: path.clone(),
                    entries: entries.clone(),
                    evidence_ref: evidence_ref.clone(),
                    receipt_id: receipt_id.clone(),
                });
                self.workspace_cursor = self.workspace_cursor.min(entries.len().saturating_sub(1));
                if let Some(reference) = evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: "workspace.list".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some("workspace.list".to_owned()),
                        summary: format!("{} entrie(s) listed at {path}", entries.len()),
                    });
                }
                if let Some(receipt) = receipt_id.clone() {
                    self.record_receipt(ReceiptProjection {
                        receipt_id: receipt,
                        source: "workspace.list".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some("workspace.list".to_owned()),
                        status: "EXECUTED".to_owned(),
                        evidence_ref: evidence_ref.clone(),
                    });
                }
                self.transcript.push(format!(
                    "WORKSPACE  listed · {path} · {} entrie(s) · evidence {} · receipt {}",
                    self.workspace_listing
                        .as_ref()
                        .map_or(0, |listing| listing.entries.len()),
                    evidence_ref.as_deref().unwrap_or("none"),
                    receipt_id.as_deref().unwrap_or("none")
                ));
            }
            LbeEvent::WorkspaceReadReady {
                path,
                content,
                content_sha256,
                evidence_ref,
                receipt_id,
            } => {
                self.record_audit_file(path.clone());
                self.workspace_file = Some(WorkspaceFile {
                    path: path.clone(),
                    content,
                    content_sha256: content_sha256.clone(),
                    evidence_ref: evidence_ref.clone(),
                    receipt_id: receipt_id.clone(),
                });
                if let Some(reference) = evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: "workspace.read".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some("workspace.read".to_owned()),
                        summary: format!("{} read with verified content hash", path),
                    });
                }
                if let Some(receipt) = receipt_id.clone() {
                    self.record_receipt(ReceiptProjection {
                        receipt_id: receipt,
                        source: "workspace.read".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some("workspace.read".to_owned()),
                        status: "EXECUTED".to_owned(),
                        evidence_ref: evidence_ref.clone(),
                    });
                }
                self.workspace_file_scroll = 0;
                self.transcript.push(format!(
                    "WORKSPACE  opened · {path} · {} line(s) · sha256 {} · evidence {} · receipt {}",
                    self.workspace_file
                        .as_ref()
                        .map_or(0, |file| file.content.lines().count()),
                    content_sha256,
                    evidence_ref.as_deref().unwrap_or("none"),
                    receipt_id.as_deref().unwrap_or("none")
                ));
            }
            LbeEvent::WorkspacePatchReady { patch } => {
                self.record_audit_file(patch.path.clone());
                self.workspace_patch = Some(patch.clone());
                if let Some(reference) = patch.evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: "workspace.patch".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some("workspace.patch".to_owned()),
                        summary: format!(
                            "{} patch applied with {} byte(s)",
                            patch.path, patch.bytes
                        ),
                    });
                }
                self.record_receipt(ReceiptProjection {
                    receipt_id: patch.receipt_id.clone(),
                    source: "workspace.patch".to_owned(),
                    session_id: self.snapshot.session_id.clone(),
                    execution_id: self.active_execution_id.clone(),
                    tool_id: Some("workspace.patch".to_owned()),
                    status: "EXECUTED".to_owned(),
                    evidence_ref: patch.evidence_ref.clone(),
                });
                self.transcript.push(format!(
                    "PATCH  executed · {} · {} byte(s) · receipt {} · evidence {}",
                    patch.path,
                    patch.bytes,
                    patch.receipt_id,
                    patch.evidence_ref.as_deref().unwrap_or("none")
                ));
            }
            LbeEvent::McpRegistryUpdated {
                schema_version,
                integrations,
            } => {
                self.mcp_schema_version = schema_version;
                self.mcp_integrations = integrations.clone();
                self.transcript.push(format!(
                    "MCP  registry updated · {} integration(s)",
                    integrations.len()
                ));
            }
            LbeEvent::BirdEyeQueryReady {
                tool,
                payload,
                evidence_ref,
                receipt_id,
            } => {
                self.transcript.push(format!(
                    "BIRDEYE  query completed · {tool} · evidence {} · receipt {}",
                    evidence_ref.as_deref().unwrap_or("none"),
                    receipt_id.as_deref().unwrap_or("none")
                ));
                if let Some(reference) = evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: format!("mcp.birdeye.{tool}"),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some(format!("mcp.birdeye.{tool}")),
                        summary: "BirdEye MCP query result".to_owned(),
                    });
                }
                if let Some(receipt) = receipt_id.clone() {
                    self.record_receipt(ReceiptProjection {
                        receipt_id: receipt,
                        source: format!("mcp.birdeye.{tool}"),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: self.active_execution_id.clone(),
                        tool_id: Some(format!("mcp.birdeye.{tool}")),
                        status: payload
                            .get("status")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("EXECUTED")
                            .to_owned(),
                        evidence_ref,
                    });
                }
            }
            LbeEvent::ProviderCatalogDiscovered { providers } => {
                self.snapshot.providers = providers;
                self.provider_picker_index = self
                    .provider_picker_index
                    .min(self.snapshot.providers.len().saturating_sub(1));
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
                self.transcript
                    .push("PROVIDER  discovery started".to_owned());
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
                self.model_picker_index = self
                    .model_picker_index
                    .min(self.snapshot.models.len().saturating_sub(1));
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
                self.checkpoint_changed_files = changed_files.clone();
                self.transcript.push(format!(
                    "CHECKPOINT  comparison ready ? {checkpoint_id} ? {} file(s)",
                    changed_files.len()
                ));
            }
            LbeEvent::CheckpointRestoreRequested { checkpoint_id } => {
                self.checkpoint_restore_status = Some("RESTORE REQUESTED".to_owned());
                self.transcript
                    .push(format!("CHECKPOINT  restore requested ? {checkpoint_id}"));
            }
            LbeEvent::CheckpointRestoreBlocked {
                checkpoint_id,
                reason,
            } => {
                self.record_audit_finding("Checkpoint", reason.clone());
                self.checkpoint_restore_status = Some(format!("BLOCKED ? {reason}"));
                self.transcript.push(format!(
                    "CHECKPOINT  restore blocked ? {checkpoint_id} ? {reason}"
                ));
            }
            LbeEvent::CheckpointRestored { checkpoint_id } => {
                self.checkpoint_restore_status = Some("RESTORED".to_owned());
                self.transcript
                    .push(format!("CHECKPOINT  restored ? {checkpoint_id}"));
            }
            LbeEvent::CommandStarted {
                execution_id,
                tool_call_id,
                command_id,
                command_summary,
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_tool_call_id = Some(tool_call_id.clone());
                self.last_process_state = Some("STARTED".to_owned());
                self.last_process_activity = Some(command_summary.clone());
                self.last_process_detail = vec![command_summary.clone()];
                self.last_process_exit_code = None;
                self.last_process_log_available = false;
                self.transcript.push(format!(
                    "COMMAND  started · {command_id} · {tool_call_id} · {command_summary}"
                ));
            }
            LbeEvent::CommandStdoutDelta {
                execution_id,
                command_id,
                text,
                ..
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("RUNNING".to_owned());
                self.last_process_activity = Some(text.clone());
                self.last_process_detail.push(format!("stdout: {text}"));
                self.retain_latest_process_detail();
                self.transcript
                    .push(format!("  STDOUT {command_id} · {text}"));
            }
            LbeEvent::CommandStderrDelta {
                execution_id,
                command_id,
                text,
                ..
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("RUNNING / STDERR".to_owned());
                self.last_process_activity = Some(text.clone());
                self.last_process_detail.push(format!("stderr: {text}"));
                self.retain_latest_process_detail();
                self.transcript
                    .push(format!("  STDERR {command_id} · {text}"));
            }
            LbeEvent::CommandCompleted {
                execution_id,
                command_id,
                exit_code,
                ..
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("COMPLETED".to_owned());
                self.last_process_exit_code = Some(exit_code);
                self.last_process_activity = Some(format!("exit {exit_code}"));
                self.last_process_detail.push(format!("exit {exit_code}"));
                self.retain_latest_process_detail();
                self.transcript.push(format!(
                    "COMMAND  completed · {command_id} · exit {exit_code}"
                ));
            }
            LbeEvent::CommandFailed {
                execution_id,
                command_id,
                exit_code,
                message,
                ..
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("FAILED".to_owned());
                self.last_process_exit_code = exit_code;
                self.last_process_activity = Some(message.clone());
                self.last_process_detail.push(format!("error: {message}"));
                self.retain_latest_process_detail();
                self.transcript.push(format!(
                    "COMMAND  failed · {command_id} · exit {} · {message}",
                    exit_code.map_or_else(|| "unknown".to_owned(), |code| code.to_string())
                ));
            }
            LbeEvent::CommandDetached {
                execution_id,
                command_id,
                tool_call_id,
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_tool_call_id = Some(tool_call_id.clone());
                self.last_process_state = Some("DETACHED".to_owned());
                self.last_process_activity = Some("detached".to_owned());
                self.last_process_detail.push("detached".to_owned());
                self.retain_latest_process_detail();
                self.transcript
                    .push(format!("COMMAND  detached · {command_id} · {tool_call_id}"));
            }
            LbeEvent::DetachedCommandProgress {
                execution_id,
                command_id,
                text,
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("DETACHED / RUNNING".to_owned());
                self.last_process_activity = Some(text.clone());
                self.last_process_detail.push(format!("detached: {text}"));
                self.retain_latest_process_detail();
                self.transcript
                    .push(format!("  DETACHED {command_id} · {text}"));
            }
            LbeEvent::DetachedCommandCompleted {
                execution_id,
                command_id,
                exit_code,
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("DETACHED / COMPLETED".to_owned());
                self.last_process_exit_code = Some(exit_code);
                self.last_process_activity = Some(format!("exit {exit_code}"));
                self.last_process_detail
                    .push(format!("detached exit {exit_code}"));
                self.retain_latest_process_detail();
                self.transcript.push(format!(
                    "DETACHED COMMAND  completed · {command_id} · exit {exit_code}"
                ));
            }
            LbeEvent::DetachedLogAvailable {
                execution_id,
                command_id,
            } if self.owns_execution(&execution_id) => {
                self.last_process_command_id = Some(command_id.clone());
                self.last_process_state = Some("DETACHED / LOG AVAILABLE".to_owned());
                self.last_process_log_available = true;
                self.last_process_activity = Some("log available".to_owned());
                self.last_process_detail.push("log available".to_owned());
                self.retain_latest_process_detail();
                self.transcript
                    .push(format!("DETACHED COMMAND  log available · {command_id}"));
            }
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
                self.record_audit_finding("Context", message.clone());
                self.snapshot.compaction_state = CompactionState::Failed;
                self.transcript
                    .push(format!("CONTEXT  compaction failed · {message}"));
            }
            LbeEvent::RetryScheduled {
                execution_id,
                retry_target,
                retry_count,
                retry_limit,
                ..
            } if self.owns_execution(&execution_id) => {
                self.snapshot.retry_count = retry_count;
                self.snapshot.retry_limit = retry_limit;
                self.transcript.push(format!(
                    "RETRY  scheduled · {retry_target} · {retry_count}/{retry_limit}"
                ));
            }
            LbeEvent::RetryLimitReached {
                execution_id,
                retry_target,
                retry_limit,
                ..
            } if self.owns_execution(&execution_id) => {
                self.record_audit_finding(
                    "Retry",
                    format!("retry limit reached for {retry_target} ({retry_limit})"),
                );
                self.snapshot.retry_count = retry_limit;
                self.transcript.push(format!(
                    "RETRY  limit reached · {retry_target} · {retry_limit}"
                ));
            }
            LbeEvent::ExecutionInterrupted {
                execution_id,
                reason,
            } if self.owns_execution(&execution_id) => {
                self.snapshot.session_state = SessionStatus::Interrupted;
                self.snapshot.execution_status = Some(ExecutionStatus::Interrupted);
                self.transcript
                    .push(format!("RUNTIME  execution interrupted · {reason}"));
                self.phase = Phase::Interrupted;
            }
            LbeEvent::ExecutionResumed { execution_id } if self.owns_execution(&execution_id) => {
                self.snapshot.session_state = SessionStatus::Running;
                self.snapshot.execution_status = Some(ExecutionStatus::Running);
                self.transcript
                    .push(format!("RUNTIME  execution resumed · {execution_id}"));
                self.phase = Phase::Running;
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
            LbeEvent::TimedOut {
                execution_id,
                timeout_seconds,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_finding(
                    "Timeout",
                    format!("execution timed out after {timeout_seconds}s"),
                );
                self.snapshot.elapsed_seconds = timeout_seconds;
                self.snapshot.timeout_seconds = timeout_seconds;
                self.transcript
                    .push(format!("TIMEOUT  reached · {timeout_seconds}s"));
                self.phase = Phase::TimedOut;
                self.active_execution_id = None;
            }
            LbeEvent::DiagnosticsUpdated { checks } => {
                self.snapshot.diagnostics = checks;
            }
            LbeEvent::AssistantTextDelta { text } => {
                self.transcript.push(format!("lbe agent  {text}"));
            }
            LbeEvent::ConversationalTurnMessage {
                session_id,
                turn_id,
                event_id,
                text,
            } => {
                submit_trace(format!(
                    "app projected model response session={} turn={} event={}",
                    session_id, turn_id, event_id
                ));
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return;
                }
                self.snapshot.turn_id = Some(turn_id.clone());
                self.transcript
                    .push(format!("lbe agent  {text} ? {event_id}"));
            }
            LbeEvent::ConversationalToolReceipt {
                session_id,
                turn_id,
                event_id,
                operation_id,
                tool_id,
                status,
                receipt_id,
                evidence_ref,
            } => {
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return;
                }
                self.snapshot.turn_id = Some(turn_id.clone());
                if let Some(reference) = evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: "conversational.tool".to_owned(),
                        session_id: Some(session_id.clone()),
                        execution_id: operation_id.clone(),
                        tool_id: Some(tool_id.clone()),
                        summary: format!("{tool_id} returned {status} for turn {turn_id}"),
                    });
                }
                if let Some(receipt) = receipt_id.clone() {
                    self.record_receipt(ReceiptProjection {
                        receipt_id: receipt,
                        source: "conversational.tool".to_owned(),
                        session_id: Some(session_id.clone()),
                        execution_id: operation_id.clone(),
                        tool_id: Some(tool_id.clone()),
                        status: status.clone(),
                        evidence_ref: evidence_ref.clone(),
                    });
                }
                self.transcript.push(format!(
                    "LBE TOOL  {status} ? {tool_id} ? operation {} ? receipt {} ? evidence {} ? {event_id}",
                    operation_id.as_deref().unwrap_or("none"),
                    receipt_id.as_deref().unwrap_or("none"),
                    evidence_ref.as_deref().unwrap_or("none"),
                ));
            }
            LbeEvent::ConversationalTurnCompleted {
                session_id,
                turn_id,
                event_id,
            } => {
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return;
                }
                self.snapshot.turn_id = Some(turn_id);
                self.snapshot.session_state = SessionStatus::Completed;
                self.phase = Phase::Completed;
                self.transcript
                    .push(format!("TURN  completed ? {event_id}"));
            }
            LbeEvent::ConversationalTurnError {
                session_id,
                turn_id,
                event_id,
                message,
            } => {
                submit_trace(format!(
                    "app projected model.error session={} turn={} event={}",
                    session_id, turn_id, event_id
                ));
                if self.snapshot.session_id.as_deref() != Some(session_id.as_str()) {
                    return;
                }
                self.snapshot.turn_id = Some(turn_id.clone());
                self.record_audit_finding("Runtime", message.clone());
                self.transcript.push(format!(
                    "LBE MODEL ERROR  {message} · turn {turn_id} · {event_id}"
                ));
            }
            LbeEvent::ProposalCreated {
                approval_id,
                proposal,
            } => {
                self.phase = Phase::AwaitingApproval {
                    approval_id,
                    proposal: format!("TASK APPROVAL · {proposal}"),
                };
                self.active_execution_id = None;
            }
            LbeEvent::AuthorizationRequired {
                operation_id,
                approval_id,
                capability,
                rationale,
            } => {
                self.record_audit_finding(
                    "Authorization",
                    format!("approval required for {capability}: {rationale}"),
                );
                if let Some(pending_patch) = self.pending_patch.as_mut() {
                    pending_patch.operation_id = Some(operation_id.clone());
                    pending_patch.approval_id = Some(approval_id.clone());
                }
                self.last_authorization_operation_id = Some(operation_id.clone());
                self.last_authorization_approval_id = Some(approval_id.clone());
                self.last_authorization_capability = Some(capability.clone());
                self.last_authorization_verdict = Some("REQUIRED".to_owned());
                self.last_authorization_rationale = Some(rationale.clone());
                self.phase = Phase::AwaitingApproval {
                    approval_id,
                    proposal: format!("AUTHORIZATION REQUIRED · {capability} · {rationale}"),
                };
                self.active_execution_id = Some(operation_id);
            }
            LbeEvent::AuthorizationResolved {
                operation_id,
                approval_id,
                verdict,
                rationale,
            } => {
                if verdict != "ALLOW" {
                    self.record_audit_finding("Authorization", format!("{verdict}: {rationale}"));
                }
                if let Some(pending_patch) = &self.pending_patch {
                    if pending_patch.operation_id.as_deref() != Some(operation_id.as_str())
                        || pending_patch.approval_id.as_deref() != Some(approval_id.as_str())
                    {
                        return;
                    }
                }
                self.last_authorization_operation_id = Some(operation_id.clone());
                self.last_authorization_approval_id = Some(approval_id.clone());
                self.last_authorization_verdict = Some(verdict.clone());
                self.last_authorization_rationale = Some(rationale.clone());
                self.transcript.push(format!(
                    "AUTHORIZATION  {verdict} · {operation_id} · {approval_id} · {rationale}"
                ));
                if verdict == "ALLOW" {
                    self.phase = Phase::Welcome;
                } else if verdict == "REQUIRE_APPROVAL" || verdict == "ESCALATE" {
                    self.phase = Phase::AwaitingApproval {
                        approval_id,
                        proposal: format!("APPROVAL REQUIRED · {rationale}"),
                    };
                } else {
                    self.pending_patch = None;
                    self.phase = Phase::Rejected;
                }
                self.active_execution_id = None;
            }
            LbeEvent::PlanUpdated { text } => {
                self.transcript.push(format!("PLAN  {text}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::AuditVerdict { verdict } => {
                self.audit_verdict = Some(verdict.clone());
                self.transcript.push(format!("AUDIT  {verdict}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::ToolRequested {
                execution_id,
                tool_call_id,
                tool_name,
                input_summary,
                risk,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_tool(format!(
                    "REQUESTED · {tool_name} · {} · {input_summary}",
                    risk.label()
                ));
                self.last_tool_name = Some(tool_name.clone());
                self.last_tool_call_id = Some(tool_call_id.clone());
                self.last_tool_input = Some(input_summary.clone());
                self.last_tool_risk = Some(risk.label().to_owned());
                self.last_tool_state = Some("REQUESTED".to_owned());
                self.transcript.push(format!(
                    "TOOL  REQUESTED · {tool_name} · {} · {input_summary} · {tool_call_id}",
                    risk.label()
                ));
            }
            LbeEvent::ToolStarted {
                execution_id,
                tool_call_id,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_tool(format!("STARTED · {tool_call_id}"));
                self.last_tool_state = Some("STARTED".to_owned());
                self.transcript
                    .push(format!("TOOL  STARTED · {tool_call_id}"));
            }
            LbeEvent::ToolOutputDelta {
                execution_id,
                tool_call_id,
                text,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_tool(format!("OUTPUT · {tool_call_id} · {text}"));
                self.transcript
                    .push(format!("  TOOL {tool_call_id} · {text}"));
            }
            LbeEvent::ToolCompleted {
                execution_id,
                tool_call_id,
                evidence_ref,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_tool(format!("COMPLETED · {tool_call_id}"));
                self.last_tool_state = Some("COMPLETED".to_owned());
                self.last_execution_evidence_ref = evidence_ref.clone();
                if let Some(reference) = evidence_ref.clone() {
                    self.record_evidence(EvidenceProjection {
                        reference,
                        source: "tool.completed".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: Some(execution_id.clone()),
                        tool_id: Some(
                            self.last_tool_name
                                .clone()
                                .unwrap_or_else(|| "unknown".to_owned()),
                        ),
                        summary: format!("tool call {tool_call_id} completed"),
                    });
                }
                let evidence = evidence_ref.as_deref().unwrap_or("no evidence ref");
                self.transcript
                    .push(format!("TOOL  COMPLETED · {tool_call_id} · {evidence}"));
            }
            LbeEvent::ToolFailed {
                execution_id,
                tool_call_id,
                message,
            } if self.owns_execution(&execution_id) => {
                self.record_audit_tool(format!("FAILED · {tool_call_id} · {message}"));
                self.record_audit_finding("Tool", message.clone());
                self.last_tool_state = Some("FAILED".to_owned());
                self.transcript
                    .push(format!("TOOL  FAILED · {tool_call_id} · {message}"));
            }
            LbeEvent::ExecutionStarted { execution_id } => {
                if self.active_execution_id.is_some() {
                    return;
                }
                self.active_execution_id = Some(execution_id.clone());
                if let Phase::AwaitingApproval { proposal, .. } = &self.phase {
                    self.transcript.push(format!("lbe runtime  {proposal}"));
                }
                self.transcript
                    .push(format!("lbe runtime  EXECUTION STARTED · {execution_id}"));
                self.phase = Phase::Running;
            }
            LbeEvent::AgentRequestedCompletion { execution_id }
                if self.owns_execution(&execution_id) =>
            {
                self.transcript
                    .push(format!("AGENT  requested completion · {execution_id}"));
            }
            LbeEvent::ExecutionCompleted {
                execution_id,
                receipt_id,
            } if self.owns_execution(&execution_id) => {
                self.last_execution_receipt_id = receipt_id.clone();
                if let Some(receipt) = receipt_id.clone() {
                    self.record_receipt(ReceiptProjection {
                        receipt_id: receipt,
                        source: "execution.completed".to_owned(),
                        session_id: self.snapshot.session_id.clone(),
                        execution_id: Some(execution_id.clone()),
                        tool_id: self.last_tool_name.clone(),
                        status: "EXECUTED".to_owned(),
                        evidence_ref: self.last_execution_evidence_ref.clone(),
                    });
                }
                let receipt = receipt_id.as_deref().unwrap_or("no receipt");
                self.transcript.push(format!(
                    "EXECUTION  completed · {execution_id} · receipt {receipt}"
                ));
                // The startup workspace projection is a complete read-only
                // operation, not an active agent turn. Release the composer
                // once its authoritative receipt has arrived so the first
                // user prompt can enter the real LBE turn path.
                if self.last_tool_name.as_deref() == Some("workspace.list") {
                    self.active_execution_id = None;
                    self.phase = Phase::Welcome;
                }
            }
            LbeEvent::ValidationStarted { execution_id } if self.owns_execution(&execution_id) => {
                self.transcript
                    .push(format!("VALIDATION  started · {execution_id}"));
            }
            LbeEvent::ValidationCompleted {
                execution_id,
                status,
                result,
            } if self.owns_execution(&execution_id) => {
                if status != ValidationStatus::Passed {
                    self.record_audit_finding("Validation", result.clone());
                }
                self.transcript
                    .push(format!("VALIDATION  {} · {result}", status.label()));
            }
            LbeEvent::LbeCompletionAccepted {
                execution_id,
                receipt_id,
            } if self.owns_execution(&execution_id) => {
                let receipt = receipt_id.as_deref().unwrap_or("no receipt");
                self.transcript.push(format!(
                    "LBE RUNTIME  COMPLETION ACCEPTED · {execution_id} · receipt {receipt}"
                ));
                self.phase = Phase::Completed;
                self.active_execution_id = None;
            }
            LbeEvent::ExecutionRejected { approval_id } => {
                self.record_audit_finding("Execution", "execution rejected by authorization");
                if !matches!(self.phase, Phase::AwaitingApproval { approval_id: ref current, .. } if current == &approval_id)
                {
                    return;
                }
                self.transcript
                    .push("LBE RUNTIME  REJECTED · no execution occurred.".to_owned());
                self.phase = Phase::Rejected;
            }
            LbeEvent::SessionMemoryIndexed {
                session_id,
                session_hash,
            } => {
                self.snapshot.memory.current_session_hash = Some(session_hash.clone());
                self.snapshot.memory.indexed_sessions =
                    self.snapshot.memory.indexed_sessions.max(1);
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
                self.snapshot.memory.indexed_memories =
                    self.snapshot.memory.indexed_memories.max(records.len());
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
                self.snapshot.browser_chat.last_browser_message_id =
                    Some(browser_message_id.clone());
                self.snapshot.browser_chat.last_lbe_turn_id = self.snapshot.turn_id.clone();
                self.snapshot.browser_chat.status = "Browser message received".to_owned();
                self.transcript.push(format!(
                    "BROWSER  message · {browser_message_id} · {content}"
                ));
            }
            LbeEvent::BrowserToolRequested {
                browser_message_id,
                tool_name,
                input_summary,
            } => {
                self.snapshot.browser_chat.last_browser_message_id =
                    Some(browser_message_id.clone());
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
                self.snapshot.browser_chat.last_browser_message_id =
                    Some(browser_message_id.clone());
                self.snapshot.browser_chat.last_receipt_id = receipt_id.clone();
                self.snapshot.browser_chat.last_evidence_ref = evidence_ref.clone();
                self.snapshot.browser_chat.status = "LBE result delivered to browser".to_owned();
                self.transcript.push(format!(
                    "BROWSER  tool result delivered · {browser_message_id} · {tool_call_id}"
                ));
            }
            LbeEvent::BrowserChatConnectionLost => {
                self.record_audit_finding("Browser", "browser chat connection lost; fail closed");
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
            LbeEvent::CommandStarted { .. }
            | LbeEvent::CommandStdoutDelta { .. }
            | LbeEvent::CommandStderrDelta { .. }
            | LbeEvent::CommandCompleted { .. }
            | LbeEvent::CommandFailed { .. }
            | LbeEvent::CommandDetached { .. }
            | LbeEvent::DetachedCommandProgress { .. }
            | LbeEvent::DetachedCommandCompleted { .. }
            | LbeEvent::DetachedLogAvailable { .. }
            | LbeEvent::ToolRequested { .. }
            | LbeEvent::ToolStarted { .. }
            | LbeEvent::ToolOutputDelta { .. }
            | LbeEvent::ToolCompleted { .. }
            | LbeEvent::ToolFailed { .. }
            | LbeEvent::AgentRequestedCompletion { .. }
            | LbeEvent::ExecutionCompleted { .. }
            | LbeEvent::ValidationStarted { .. }
            | LbeEvent::ValidationCompleted { .. }
            | LbeEvent::LbeCompletionAccepted { .. }
            | LbeEvent::TimedOut { .. }
            | LbeEvent::RetryScheduled { .. }
            | LbeEvent::RetryLimitReached { .. }
            | LbeEvent::ExecutionInterrupted { .. }
            | LbeEvent::ExecutionResumed { .. } => {}
        }
    }

    fn record_evidence(&mut self, record: EvidenceProjection) {
        if !self
            .evidence_records
            .iter()
            .any(|item| item.reference == record.reference)
        {
            self.evidence_records.push(record);
        }
    }

    fn record_receipt(&mut self, record: ReceiptProjection) {
        if !self
            .receipt_records
            .iter()
            .any(|item| item.receipt_id == record.receipt_id)
        {
            self.receipt_records.push(record);
        }
    }

    fn record_audit_finding(&mut self, category: impl Into<String>, detail: impl Into<String>) {
        let finding = AuditFinding {
            category: category.into(),
            detail: detail.into(),
        };
        if !self.audit_findings.contains(&finding) {
            self.audit_findings.push(finding);
        }
    }

    fn record_audit_file(&mut self, path: String) {
        if !path.trim().is_empty() && !self.audit_affected_files.contains(&path) {
            self.audit_affected_files.push(path);
        }
    }

    fn record_audit_tool(&mut self, detail: String) {
        const AUDIT_TRACE_LIMIT: usize = 64;
        self.audit_tool_trace.push(detail);
        let excess = self
            .audit_tool_trace
            .len()
            .saturating_sub(AUDIT_TRACE_LIMIT);
        if excess > 0 {
            self.audit_tool_trace.drain(..excess);
        }
    }

    pub(crate) fn continue_authorized_patch(
        &mut self,
        wrapper: &mut (impl LbeWrapper + ?Sized),
        now: Instant,
    ) {
        let Some(pending_patch) = self.pending_patch.take() else {
            return;
        };
        if self.last_authorization_verdict.as_deref() != Some("ALLOW")
            || pending_patch.operation_id.as_deref()
                != self.last_authorization_operation_id.as_deref()
            || pending_patch.approval_id.as_deref()
                != self.last_authorization_approval_id.as_deref()
        {
            self.pending_patch = Some(pending_patch);
            return;
        }
        self.phase = Phase::Running;
        self.transcript.push(format!(
            "PATCH  AUTHORIZED — SUBMITTING · {} through Agent Wall",
            pending_patch.path
        ));
        self.apply_wrapper_result(wrapper.submit(
            UserRequest::PatchWorkspace {
                path: pending_patch.path,
                content: pending_patch.content,
                expected_sha256: pending_patch.expected_sha256,
            },
            now,
        ));
    }

    fn owns_execution(&self, execution_id: &str) -> bool {
        self.active_execution_id.as_deref() == Some(execution_id)
    }

    fn scroll_workspace_file(&mut self, delta: i32) {
        let Some(file) = &self.workspace_file else {
            return;
        };
        let line_count = file.content.lines().count().saturating_sub(1);
        if delta.is_negative() {
            self.workspace_file_scroll = self
                .workspace_file_scroll
                .saturating_sub(delta.unsigned_abs() as usize);
        } else {
            self.workspace_file_scroll = self
                .workspace_file_scroll
                .saturating_add(delta as usize)
                .min(line_count);
        }
    }

    fn scroll_audit(&mut self, delta: i32) {
        if delta.is_negative() {
            self.audit_scroll = self
                .audit_scroll
                .saturating_sub(delta.unsigned_abs() as usize);
        } else {
            self.audit_scroll = self.audit_scroll.saturating_add(delta as usize);
        }
    }

    fn move_command_palette(&mut self, delta: i32) {
        let len = command_palette_commands().len();
        if len == 0 {
            self.command_palette_index = 0;
            return;
        }
        self.command_palette_index = if delta.is_negative() {
            self.command_palette_index
                .saturating_sub(delta.unsigned_abs() as usize)
        } else {
            self.command_palette_index
                .saturating_add(delta as usize)
                .min(len - 1)
        };
    }

    fn execute_command_palette(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized)) {
        if let Some((command, _)) = command_palette_commands().get(self.command_palette_index) {
            self.handle_command(command, wrapper);
        }
    }

    fn move_model_picker(&mut self, delta: i32) {
        let len = self.snapshot.models.len();
        if len == 0 {
            self.model_picker_index = 0;
            return;
        }
        self.model_picker_index = if delta.is_negative() {
            self.model_picker_index
                .saturating_sub(delta.unsigned_abs() as usize)
        } else {
            self.model_picker_index
                .saturating_add(delta as usize)
                .min(len - 1)
        };
    }

    fn move_provider_picker(&mut self, delta: i32) {
        let len = self.snapshot.providers.len();
        if len == 0 {
            self.provider_picker_index = 0;
            return;
        }
        self.provider_picker_index = if delta.is_negative() {
            self.provider_picker_index
                .saturating_sub(delta.unsigned_abs() as usize)
        } else {
            self.provider_picker_index
                .saturating_add(delta as usize)
                .min(len - 1)
        };
    }

    fn move_session_picker(&mut self, delta: i32) {
        let len = self.snapshot.sessions.len();
        if len == 0 {
            self.session_picker_index = 0;
            return;
        }
        self.session_picker_index = if delta.is_negative() {
            self.session_picker_index
                .saturating_sub(delta.unsigned_abs() as usize)
        } else {
            self.session_picker_index
                .saturating_add(delta as usize)
                .min(len - 1)
        };
    }

    fn validate_selected_provider(
        &mut self,
        wrapper: &mut (impl LbeWrapper + ?Sized),
        now: Instant,
    ) {
        let Some(provider) = self.snapshot.providers.get(self.provider_picker_index) else {
            self.transcript
                .push("PROVIDER  no discovered providers available".to_owned());
            return;
        };
        self.apply_wrapper_result(wrapper.submit(
            UserRequest::ValidateProvider {
                provider_id: provider.provider_id,
            },
            now,
        ));
    }

    fn resume_selected_session(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized), now: Instant) {
        let Some(session) = self.snapshot.sessions.get(self.session_picker_index) else {
            return;
        };
        self.apply_wrapper_result(wrapper.submit(
            UserRequest::ResumeSession {
                session_id: session.session_id.clone(),
            },
            now,
        ));
        self.panel = None;
    }

    fn move_workspace_cursor(&mut self, delta: i32) {
        let len = self
            .workspace_listing
            .as_ref()
            .map_or(0, |listing| listing.entries.len());
        if len == 0 {
            self.workspace_cursor = 0;
            return;
        }
        self.workspace_cursor = if delta.is_negative() {
            self.workspace_cursor
                .saturating_sub(delta.unsigned_abs() as usize)
        } else {
            self.workspace_cursor
                .saturating_add(delta as usize)
                .min(len - 1)
        };
    }

    fn open_workspace_cursor(
        &mut self,
        wrapper: &mut (impl LbeWrapper + ?Sized),
        now: Instant,
    ) -> bool {
        let Some(entry) = self
            .workspace_listing
            .as_ref()
            .and_then(|listing| listing.entries.get(self.workspace_cursor))
            .cloned()
        else {
            return false;
        };
        self.workspace_file = None;
        let request = if entry.entry_type == "directory" {
            UserRequest::ListWorkspace { path: entry.path }
        } else {
            UserRequest::InspectWorkspace { path: entry.path }
        };
        self.apply_wrapper_result(wrapper.submit(request, now));
        true
    }

    fn select_model(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized), now: Instant) {
        let Some(model) = self.snapshot.models.get(self.model_picker_index) else {
            self.transcript
                .push("MODEL  no discovered models available".to_owned());
            return;
        };
        let model_ref = ModelRef {
            provider_id: model.provider_id,
            model_id: model.model_id.clone(),
        };
        self.apply_wrapper_result(
            wrapper.submit(UserRequest::SelectModel { model: model_ref }, now),
        );
        self.panel = None;
    }

    fn compare_checkpoint(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized)) {
        let Some(checkpoint) = self.snapshot.latest_checkpoint.as_ref() else {
            self.transcript
                .push("CHECKPOINT  no checkpoint available".to_owned());
            return;
        };
        self.apply_wrapper_result(wrapper.submit(
            UserRequest::CompareCheckpoint {
                checkpoint_id: checkpoint.checkpoint_id.clone(),
            },
            Instant::now(),
        ));
    }

    fn restore_checkpoint(&mut self, wrapper: &mut (impl LbeWrapper + ?Sized)) {
        let Some(checkpoint) = self.snapshot.latest_checkpoint.as_ref() else {
            self.transcript
                .push("CHECKPOINT  no checkpoint available".to_owned());
            return;
        };
        self.apply_wrapper_result(wrapper.submit(
            UserRequest::RestoreCheckpoint {
                checkpoint_id: checkpoint.checkpoint_id.clone(),
            },
            Instant::now(),
        ));
    }

    fn scroll_transcript(&mut self, delta: i32) {
        let offset = self.transcript_scroll.unwrap_or(0);
        self.transcript_scroll = Some(if delta.is_negative() {
            offset.saturating_sub(delta.unsigned_abs() as usize)
        } else {
            offset.saturating_add(delta as usize)
        });
    }

    fn workspace_file_end(&self) -> usize {
        self.workspace_file
            .as_ref()
            .map_or(0, |file| file.content.lines().count().saturating_sub(1))
    }

    pub(crate) fn next_intro_wake(&self, now: Instant) -> Option<Duration> {
        let _ = (self, now);
        None
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
