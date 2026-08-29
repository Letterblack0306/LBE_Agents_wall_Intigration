use std::{
    collections::VecDeque,
    io::{self, Write as _},
    time::{Duration, Instant},
};

use ratatui::termina::{
    EventReader, PlatformTerminal, Terminal as _,
    escape::csi::{Csi, DecPrivateMode, DecPrivateModeCode, Mode},
    event::{Event, KeyCode, KeyEvent, KeyEventKind, Modifiers},
};
use ratatui::{
    Terminal,
    backend::TerminaBackend,
    layout::{Alignment, Constraint, Layout, Margin, Rect},
    prelude::*,
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
};

type AppTerminal = Terminal<TerminaBackend<PlatformTerminal>>;

const MIN_WIDTH: u16 = 60;
const MIN_HEIGHT: u16 = 18;
const OUTER_REVEAL: Duration = Duration::from_millis(100);
const FRAME_REVEAL: Duration = Duration::from_millis(300);
const BRACKETS_REVEAL: Duration = Duration::from_millis(700);
const BAR_REVEAL: Duration = Duration::from_millis(1100);
const SLOGAN_REVEAL: Duration = Duration::from_millis(1300);
const BAR_BLINK_START: Duration = Duration::from_millis(1400);
const BAR_BLINK_HALF_PERIOD: Duration = Duration::from_millis(450);
const LOGO: [&str; 17] = [
    "███████████████████████████████████████",
    "██                                   ██",
    "██   █████████████████████████████   ██",
    "██   █                           █   ██",
    "██   █   ████████     ████████   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   █         █         █   █   ██",
    "██   █   ████████     ████████   █   ██",
    "██   █                           █   ██",
    "██   █████████████████████████████   ██",
    "██                                   ██",
    "███████████████████████████████████████",
];

#[derive(Clone, Copy)]
struct Palette {
    bg: Color,
    ink: Color,
    muted: Color,
    faint: Color,
    line: Color,
    red: Color,
    green: Color,
    amber: Color,
    logo_outer: Color,
}

const PALETTE: Palette = Palette {
    bg: Color::Rgb(13, 15, 18),
    ink: Color::Rgb(232, 235, 239),
    muted: Color::Rgb(139, 146, 156),
    faint: Color::Rgb(92, 98, 107),
    line: Color::Rgb(43, 48, 56),
    red: Color::Rgb(217, 74, 74),
    green: Color::Rgb(79, 209, 139),
    amber: Color::Rgb(224, 168, 79),
    logo_outer: Color::Rgb(55, 65, 81),
};

#[derive(Debug, Clone, PartialEq, Eq)]
enum Phase {
    Welcome,
    AwaitingApproval {
        approval_id: String,
        proposal: String,
    },
    Running,
    Completed,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AgentMode {
    Audit,
    Regular,
    Plan,
}

impl AgentMode {
    fn next(self) -> Self {
        match self {
            Self::Audit => Self::Regular,
            Self::Regular => Self::Plan,
            Self::Plan => Self::Audit,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Audit => "Lbe Audit",
            Self::Regular => "Agent regular",
            Self::Plan => "Plan",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeConnection {
    Mock,
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Attached,
    Error,
}

impl RuntimeConnection {
    fn label(self) -> &'static str {
        match self {
            Self::Mock => "MOCK / NOT CONNECTED",
            Self::Disconnected => "DISCONNECTED",
            Self::Connecting => "CONNECTING",
            Self::Connected => "CONNECTED",
            Self::Reconnecting => "RECONNECTING",
            Self::Attached => "ATTACHED",
            Self::Error => "CONNECTION ERROR",
        }
    }

    fn marker(self) -> &'static str {
        match self {
            Self::Connected | Self::Attached => "●",
            _ => "○",
        }
    }

    fn color(self) -> Color {
        match self {
            Self::Connected | Self::Attached => PALETTE.green,
            Self::Connecting | Self::Reconnecting => PALETTE.amber,
            Self::Error => PALETTE.red,
            Self::Mock | Self::Disconnected => PALETTE.muted,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LbeSnapshot {
    runtime_id: Option<String>,
    runtime_mode: RuntimeMode,
    attached_client_count: usize,
    lineage: SessionLineage,
    session_id: Option<String>,
    session_state: SessionStatus,
    turn_id: Option<String>,
    workspace_id: Option<String>,
    workspace_label: String,
    model_id: String,
    model_family: String,
    effort_label: Option<String>,
    context_used: usize,
    context_capacity: usize,
    compaction_available: bool,
    compaction_state: CompactionState,
    latest_checkpoint: Option<CheckpointDescriptor>,
    retry_count: u32,
    retry_limit: u32,
    timeout_seconds: u64,
    elapsed_seconds: u64,
    diagnostics: Vec<DiagnosticCheck>,
    active_mode: AgentMode,
    connection: RuntimeConnection,
    providers: Vec<ProviderProjection>,
    models: Vec<ModelDescriptor>,
    selected_model: Option<ModelRef>,
}

impl Default for LbeSnapshot {
    fn default() -> Self {
        Self {
            runtime_id: Some("runtime_mock_tui".to_owned()),
            runtime_mode: RuntimeMode::Mock,
            attached_client_count: 0,
            lineage: SessionLineage {
                root_session_id: "sess_mock_7f31".to_owned(),
                parent_session_id: None,
                origin: SessionOrigin::User,
            },
            session_id: Some("sess_mock_7f31".to_owned()),
            session_state: SessionStatus::Idle,
            turn_id: Some("turn_mock_0".to_owned()),
            workspace_id: Some("workspace_mock_lbe_tui_lab".to_owned()),
            workspace_label: r"C:\Users\".to_owned(),
            model_id: "Model ID".to_owned(),
            model_family: "Gemini".to_owned(),
            effort_label: Some("low".to_owned()),
            context_used: 2,
            context_capacity: 10,
            compaction_available: true,
            compaction_state: CompactionState::Idle,
            latest_checkpoint: None,
            retry_count: 0,
            retry_limit: 3,
            timeout_seconds: 900,
            elapsed_seconds: 0,
            diagnostics: mock_diagnostics(),
            active_mode: AgentMode::Regular,
            connection: RuntimeConnection::Mock,
            providers: mock_provider_catalog(),
            models: mock_model_catalog(),
            selected_model: Some(ModelRef {
                provider_id: ProviderId::Gemini,
                model_id: "gemini-2.5-flash-preview".to_owned(),
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeMode {
    Mock,
    Local,
    Hub,
    Detached,
}

impl RuntimeMode {
    fn label(self) -> &'static str {
        match self {
            Self::Mock => "MOCK",
            Self::Local => "LOCAL",
            Self::Hub => "HUB",
            Self::Detached => "DETACHED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderId {
    OpenAi,
    Anthropic,
    Gemini,
    Bedrock,
    Mistral,
    OpenAiCompatible,
    LmStudio,
    Ollama,
}

impl ProviderId {
    fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Anthropic => "Anthropic",
            Self::Gemini => "Google Gemini",
            Self::Bedrock => "AWS Bedrock",
            Self::Mistral => "Mistral",
            Self::OpenAiCompatible => "OpenAI-compatible",
            Self::LmStudio => "LM Studio",
            Self::Ollama => "Ollama",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CredentialRef(String);

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderConfig {
    provider_id: ProviderId,
    base_url: Option<String>,
    credential_ref: Option<CredentialRef>,
    headers: Vec<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AuthState {
    NotConfigured,
    Configured,
    Validating,
    Ready,
    Error,
}

impl AuthState {
    fn label(self) -> &'static str {
        match self {
            Self::NotConfigured => "NOT CONFIGURED",
            Self::Configured => "CONFIGURED",
            Self::Validating => "VALIDATING",
            Self::Ready => "READY",
            Self::Error => "AUTH ERROR",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderHealth {
    Unknown,
    Ready,
    Offline,
    Error,
}

impl ProviderHealth {
    fn label(self) -> &'static str {
        match self {
            Self::Unknown => "UNKNOWN",
            Self::Ready => "READY",
            Self::Offline => "OFFLINE",
            Self::Error => "ERROR",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderCapabilities {
    streaming: bool,
    tools: bool,
    reasoning: bool,
    images: bool,
    prompt_caching: bool,
    max_context: Option<u32>,
    max_output: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelRef {
    provider_id: ProviderId,
    model_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelDescriptor {
    provider_id: ProviderId,
    model_id: String,
    display_name: String,
    context_window: Option<u32>,
    max_output_tokens: Option<u32>,
    capabilities: ProviderCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderProjection {
    provider_id: ProviderId,
    auth_state: AuthState,
    health: ProviderHealth,
    is_local: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ToolDefinition {
    name: String,
    description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelRequest {
    model: ModelRef,
    messages: Vec<Message>,
    tools: Vec<ToolDefinition>,
    stream: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum ModelEvent {
    ResponseStarted { generation_id: String },
    TextDelta { text: String },
    ReasoningDelta { text: String },
    ToolCallStarted { call_id: String, tool_name: String },
    ToolCallArgumentsDelta { call_id: String, delta: String },
    ToolCallCompleted { call_id: String },
    UsageUpdated { usage: Usage },
    ResponseCompleted { reason: FinishReason },
    ProviderError(ProviderError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Usage {
    input_tokens: u64,
    output_tokens: u64,
    cached_tokens: Option<u64>,
    cost_micros: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FinishReason {
    Stop,
    ToolCall,
    Length,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderError {
    provider_id: ProviderId,
    code: Option<String>,
    message: String,
}

fn mock_provider_catalog() -> Vec<ProviderProjection> {
    vec![
        ProviderProjection {
            provider_id: ProviderId::Gemini,
            auth_state: AuthState::Ready,
            health: ProviderHealth::Ready,
            is_local: false,
        },
        ProviderProjection {
            provider_id: ProviderId::OpenAi,
            auth_state: AuthState::NotConfigured,
            health: ProviderHealth::Unknown,
            is_local: false,
        },
        ProviderProjection {
            provider_id: ProviderId::Anthropic,
            auth_state: AuthState::NotConfigured,
            health: ProviderHealth::Unknown,
            is_local: false,
        },
        ProviderProjection {
            provider_id: ProviderId::LmStudio,
            auth_state: AuthState::Ready,
            health: ProviderHealth::Ready,
            is_local: true,
        },
        ProviderProjection {
            provider_id: ProviderId::Ollama,
            auth_state: AuthState::NotConfigured,
            health: ProviderHealth::Offline,
            is_local: true,
        },
    ]
}

fn mock_model_catalog() -> Vec<ModelDescriptor> {
    vec![ModelDescriptor {
        provider_id: ProviderId::Gemini,
        model_id: "gemini-2.5-flash-preview".to_owned(),
        display_name: "Gemini 2.5 Flash Preview".to_owned(),
        context_window: Some(1_000_000),
        max_output_tokens: Some(65_536),
        capabilities: ProviderCapabilities {
            streaming: true,
            tools: true,
            reasoning: true,
            images: true,
            prompt_caching: true,
            max_context: Some(1_000_000),
            max_output: Some(65_536),
        },
    }]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionStatus {
    Idle,
    Running,
    WaitingForApproval,
    WaitingForInput,
    Completed,
    Failed,
    Aborted,
}

impl SessionStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Idle => "IDLE",
            Self::Running => "RUNNING",
            Self::WaitingForApproval => "WAITING FOR APPROVAL",
            Self::WaitingForInput => "WAITING FOR INPUT",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
            Self::Aborted => "ABORTED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionOrigin {
    User,
    Automation,
    Subagent,
    Team,
}

impl SessionOrigin {
    fn label(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Automation => "automation",
            Self::Subagent => "subagent",
            Self::Team => "team",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionLineage {
    root_session_id: String,
    parent_session_id: Option<String>,
    origin: SessionOrigin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CompactionState {
    Idle,
    Suggested,
    Running,
    Completed,
    Failed,
}

impl CompactionState {
    fn label(self) -> &'static str {
        match self {
            Self::Idle => "IDLE",
            Self::Suggested => "SUGGESTED",
            Self::Running => "RUNNING",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CheckpointDescriptor {
    checkpoint_id: String,
    created_at: String,
    workspace_revision: String,
    changed_files: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DiagnosticStatus {
    Pass,
    Warning,
    Fail,
}

impl DiagnosticStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Pass => "PASS",
            Self::Warning => "WARNING",
            Self::Fail => "FAIL",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DiagnosticCheck {
    id: String,
    category: String,
    status: DiagnosticStatus,
    message: String,
    remediation_available: bool,
}

fn mock_diagnostics() -> Vec<DiagnosticCheck> {
    vec![
        DiagnosticCheck {
            id: "runtime.mock".to_owned(),
            category: "runtime".to_owned(),
            status: DiagnosticStatus::Warning,
            message: "Mock runtime only; no canonical wall attached.".to_owned(),
            remediation_available: false,
        },
        DiagnosticCheck {
            id: "terminal.termina".to_owned(),
            category: "terminal".to_owned(),
            status: DiagnosticStatus::Pass,
            message: "Termina UI contract preview is active.".to_owned(),
            remediation_available: false,
        },
    ]
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum UserRequest {
    SubmitTask { intent: String, mode: AgentMode },
    Continue { session_id: String, message: String },
    RefreshProviderCatalog,
    SelectModel { model: ModelRef },
    CompactContext,
    RunDiagnostics,
    Approve { approval_id: String },
    Reject { approval_id: String },
    SetMode { mode: AgentMode },
    Abort,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LbeError {
    message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum LbeEvent {
    SessionStarted {
        session_id: String,
    },
    SessionRestored {
        session_id: String,
    },
    RuntimeAttachmentUpdated {
        connection: RuntimeConnection,
        runtime_id: Option<String>,
        runtime_mode: RuntimeMode,
        attached_client_count: usize,
    },
    SessionStatusUpdated {
        status: SessionStatus,
    },
    SnapshotUpdated {
        snapshot: LbeSnapshot,
    },
    ProviderCatalogDiscovered {
        providers: Vec<ProviderProjection>,
    },
    ProviderDiscoveryStarted,
    ProviderDiscoveryCompleted {
        providers: Vec<ProviderId>,
    },
    ProviderValidationStarted {
        provider_id: ProviderId,
    },
    ProviderValidationCompleted {
        provider_id: ProviderId,
    },
    ProviderHealthUpdated {
        provider_id: ProviderId,
        health: ProviderHealth,
    },
    ProviderAuthStateUpdated {
        provider_id: ProviderId,
        auth_state: AuthState,
    },
    ModelCatalogDiscovered {
        models: Vec<ModelDescriptor>,
    },
    CheckpointCreated {
        checkpoint: CheckpointDescriptor,
    },
    CheckpointComparisonReady {
        checkpoint_id: String,
        changed_files: Vec<String>,
    },
    CheckpointRestoreRequested {
        checkpoint_id: String,
    },
    CheckpointRestoreBlocked {
        checkpoint_id: String,
        reason: String,
    },
    CheckpointRestored {
        checkpoint_id: String,
    },
    CommandStarted {
        tool_call_id: String,
        command_id: String,
        command_summary: String,
    },
    CommandStdoutDelta {
        tool_call_id: String,
        command_id: String,
        text: String,
    },
    CommandStderrDelta {
        tool_call_id: String,
        command_id: String,
        text: String,
    },
    CommandCompleted {
        tool_call_id: String,
        command_id: String,
        exit_code: i32,
    },
    CommandFailed {
        tool_call_id: String,
        command_id: String,
        exit_code: Option<i32>,
        message: String,
    },
    CommandDetached {
        tool_call_id: String,
        command_id: String,
    },
    DetachedCommandProgress {
        command_id: String,
        text: String,
    },
    DetachedCommandCompleted {
        command_id: String,
        exit_code: i32,
    },
    DetachedLogAvailable {
        command_id: String,
    },
    ContextCompactionSuggested,
    ContextCompactionStarted,
    ContextCompactionCompleted {
        context_used: usize,
    },
    ContextCompactionFailed {
        message: String,
    },
    RetryScheduled {
        retry_count: u32,
        retry_limit: u32,
    },
    RetryLimitReached {
        retry_limit: u32,
    },
    TimeoutWarning {
        elapsed_seconds: u64,
        timeout_seconds: u64,
    },
    TimedOut {
        timeout_seconds: u64,
    },
    DiagnosticsUpdated {
        checks: Vec<DiagnosticCheck>,
    },
    AssistantTextDelta {
        text: String,
    },
    ProposalCreated {
        approval_id: String,
        proposal: String,
    },
    PlanUpdated {
        text: String,
    },
    AuditVerdict {
        verdict: String,
    },
    ToolRequested {
        tool_call_id: String,
        tool_name: String,
        input_summary: String,
        risk: ToolRisk,
    },
    ToolStarted {
        tool_call_id: String,
    },
    ToolOutputDelta {
        tool_call_id: String,
        text: String,
    },
    ToolCompleted {
        tool_call_id: String,
        evidence_ref: Option<String>,
    },
    ToolFailed {
        tool_call_id: String,
        message: String,
    },
    ExecutionStarted {
        execution_id: String,
    },
    AgentRequestedCompletion {
        execution_id: String,
    },
    ExecutionCompleted {
        execution_id: String,
        receipt_id: Option<String>,
    },
    ValidationStarted {
        execution_id: String,
    },
    ValidationCompleted {
        status: ValidationStatus,
        result: String,
    },
    LbeCompletionAccepted {
        execution_id: String,
        receipt_id: Option<String>,
    },
    ExecutionRejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolRisk {
    ReadOnly,
    Governed,
    Elevated,
}

impl ToolRisk {
    fn label(self) -> &'static str {
        match self {
            Self::ReadOnly => "READ_ONLY",
            Self::Governed => "GOVERNED",
            Self::Elevated => "ELEVATED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ValidationStatus {
    Passed,
    Failed,
    InsufficientEvidence,
}

impl ValidationStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Passed => "PASSED",
            Self::Failed => "FAILED",
            Self::InsufficientEvidence => "INSUFFICIENT_EVIDENCE",
        }
    }
}

#[derive(Debug)]
struct ScheduledLbeEvent {
    due_at: Instant,
    event: LbeEvent,
}

trait LbeWrapper {
    fn snapshot(&self) -> LbeSnapshot;
    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError>;
    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError>;
    fn next_wake(&self, now: Instant) -> Option<Duration>;
}

#[derive(Debug, Default)]
struct MockLbeWrapper {
    snapshot: LbeSnapshot,
    scheduled: VecDeque<ScheduledLbeEvent>,
    pending_approval_id: Option<String>,
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
}

impl LbeWrapper for MockLbeWrapper {
    fn snapshot(&self) -> LbeSnapshot {
        self.snapshot.clone()
    }

    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError> {
        match request {
            UserRequest::SubmitTask { intent, mode } => match mode {
                AgentMode::Regular => {
                    let approval_id = "apr_mock_7f31".to_owned();
                    self.pending_approval_id = Some(approval_id.clone());
                    self.emit(LbeEvent::ProposalCreated {
                        approval_id,
                        proposal: format!("Proposed: {intent}"),
                    });
                    self.snapshot.session_state = SessionStatus::WaitingForApproval;
                    self.emit(LbeEvent::SessionStatusUpdated {
                        status: self.snapshot.session_state,
                    });
                }
                AgentMode::Plan => self.emit(LbeEvent::PlanUpdated {
                    text: format!("Mock plan: investigate {intent}; no execution requested."),
                }),
                AgentMode::Audit => self.emit(LbeEvent::AuditVerdict {
                    verdict: "INSUFFICIENT_EVIDENCE · mock runtime is not connected to LBE guards."
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
                for provider in &providers {
                    self.emit(LbeEvent::ProviderValidationStarted {
                        provider_id: provider.provider_id,
                    });
                    self.emit(LbeEvent::ProviderAuthStateUpdated {
                        provider_id: provider.provider_id,
                        auth_state: provider.auth_state,
                    });
                    self.emit(LbeEvent::ProviderHealthUpdated {
                        provider_id: provider.provider_id,
                        health: provider.health,
                    });
                    self.emit(LbeEvent::ProviderValidationCompleted {
                        provider_id: provider.provider_id,
                    });
                }
                self.emit(LbeEvent::ModelCatalogDiscovered {
                    models: self.snapshot.models.clone(),
                });
                let discovered = providers
                    .iter()
                    .map(|provider| provider.provider_id)
                    .collect::<Vec<_>>();
                self.emit(LbeEvent::ProviderDiscoveryCompleted {
                    providers: discovered,
                });
            }
            UserRequest::CompactContext => {
                if !self.snapshot.compaction_available {
                    self.emit(LbeEvent::ContextCompactionFailed {
                        message: "Context compaction is unavailable in the mock runtime."
                            .to_owned(),
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
                let execution_id = "exec_mock_7f31".to_owned();
                self.snapshot.session_state = SessionStatus::Running;
                self.emit(LbeEvent::ExecutionStarted {
                    execution_id: execution_id.clone(),
                });
                self.emit(LbeEvent::SessionStatusUpdated {
                    status: self.snapshot.session_state,
                });
                self.scheduled.extend([
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(250),
                        event: LbeEvent::CheckpointCreated {
                            checkpoint: CheckpointDescriptor {
                                checkpoint_id: "chk_mock_before_exec".to_owned(),
                                created_at: "mock-time".to_owned(),
                                workspace_revision: "mock-rev-7f31".to_owned(),
                                changed_files: vec!["rust/main.rs".to_owned()],
                            },
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(300),
                        event: LbeEvent::ToolRequested {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            tool_name: "workspace.inspect".to_owned(),
                            input_summary: "active workspace".to_owned(),
                            risk: ToolRisk::ReadOnly,
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(350),
                        event: LbeEvent::ToolStarted {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(400),
                        event: LbeEvent::CommandStarted {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            command_id: "cmd_mock_check".to_owned(),
                            command_summary: "cargo check (mock only)".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(450),
                        event: LbeEvent::CommandStdoutDelta {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            command_id: "cmd_mock_check".to_owned(),
                            text: "Checking mock workspace...".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(500),
                        event: LbeEvent::CommandStderrDelta {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            command_id: "cmd_mock_check".to_owned(),
                            text: "mock stderr is display-only".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(550),
                        event: LbeEvent::CommandCompleted {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            command_id: "cmd_mock_check".to_owned(),
                            exit_code: 0,
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(600),
                        event: LbeEvent::ToolOutputDelta {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            text: "Inspecting active workspace...".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(650),
                        event: LbeEvent::ToolCompleted {
                            tool_call_id: "tool_mock_workspace".to_owned(),
                            evidence_ref: Some("evidence_mock_workspace".to_owned()),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(700),
                        event: LbeEvent::AgentRequestedCompletion {
                            execution_id: execution_id.clone(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(750),
                        event: LbeEvent::ExecutionCompleted {
                            execution_id: execution_id.clone(),
                            receipt_id: Some("rcpt_demo_7f31".to_owned()),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(800),
                        event: LbeEvent::ValidationStarted {
                            execution_id: execution_id.clone(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(900),
                        event: LbeEvent::ValidationCompleted {
                            status: ValidationStatus::Passed,
                            result: "Focused validation complete.".to_owned(),
                        },
                    },
                    ScheduledLbeEvent {
                        due_at: now + Duration::from_millis(950),
                        event: LbeEvent::LbeCompletionAccepted {
                            execution_id,
                            receipt_id: Some("rcpt_demo_7f31".to_owned()),
                        },
                    },
                ]);
            }
            UserRequest::Reject { approval_id } => {
                if self.pending_approval_id.as_deref() != Some(approval_id.as_str()) {
                    return Err(LbeError {
                        message: "approval ID is not pending in the mock runtime".to_owned(),
                    });
                }
                self.pending_approval_id = None;
                self.scheduled.clear();
                self.snapshot.session_state = SessionStatus::WaitingForInput;
                self.emit(LbeEvent::ExecutionRejected);
                self.emit(LbeEvent::SessionStatusUpdated {
                    status: self.snapshot.session_state,
                });
            }
            UserRequest::SelectModel { model } => {
                let in_catalog = self.snapshot.models.iter().any(|candidate| {
                    candidate.provider_id == model.provider_id
                        && candidate.model_id == model.model_id
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
            UserRequest::Abort => {
                self.pending_approval_id = None;
                self.scheduled.clear();
                self.snapshot.session_state = SessionStatus::Aborted;
                self.emit(LbeEvent::ExecutionRejected);
                self.emit(LbeEvent::SessionStatusUpdated {
                    status: self.snapshot.session_state,
                });
            }
        }
        Ok(())
    }

    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError> {
        if self
            .scheduled
            .front()
            .is_some_and(|scheduled| scheduled.due_at <= now)
        {
            return Ok(self.scheduled.pop_front().map(|scheduled| scheduled.event));
        }
        Ok(None)
    }

    fn next_wake(&self, now: Instant) -> Option<Duration> {
        self.scheduled
            .front()
            .map(|scheduled| scheduled.due_at.saturating_duration_since(now))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MockPanel {
    Account,
    Provider,
    Model,
    Mcp,
    Tools,
    History,
    Session,
    Evidence,
    Receipts,
    Status,
    Undo,
    Doctor,
}

#[derive(Debug)]
struct App {
    input: String,
    transcript: Vec<String>,
    phase: Phase,
    agent_mode: AgentMode,
    show_shortcuts: bool,
    panel: Option<MockPanel>,
    input_history: Vec<String>,
    history_index: Option<usize>,
    should_quit: bool,
    intro_started_at: Instant,
    snapshot: LbeSnapshot,
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
    fn handle_key(&mut self, key: KeyEvent, wrapper: &mut impl LbeWrapper, now: Instant) {
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

    fn submit_or_approve(&mut self, wrapper: &mut impl LbeWrapper, now: Instant) {
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

    fn dismiss_or_reject(&mut self, wrapper: &mut impl LbeWrapper) {
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

    fn set_mode(&mut self, wrapper: &mut impl LbeWrapper, mode: AgentMode) {
        self.apply_wrapper_result(wrapper.submit(UserRequest::SetMode { mode }, Instant::now()));
    }

    fn apply_wrapper_result(&mut self, result: Result<(), LbeError>) {
        if let Err(error) = result {
            self.transcript
                .push(format!("LBE WRAPPER ERROR  {}", error.message));
        }
    }

    fn handle_command(&mut self, command: &str, wrapper: &mut impl LbeWrapper) {
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

    fn recall_history(&mut self, older: bool) {
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

    fn reduce_lbe_event(&mut self, event: LbeEvent) {
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
        }
    }

    fn next_wake(&self, now: Instant) -> Option<Duration> {
        let intro_wake = self.next_intro_wake(now);
        let runtime_wake = None;
        match (intro_wake, runtime_wake) {
            (Some(intro), Some(runtime)) => Some(intro.min(runtime)),
            (Some(intro), None) => Some(intro),
            (None, Some(runtime)) => Some(runtime),
            (None, None) => None,
        }
    }

    fn intro_elapsed(&self, now: Instant) -> Duration {
        now.saturating_duration_since(self.intro_started_at)
    }

    fn next_intro_wake(&self, now: Instant) -> Option<Duration> {
        if !self.transcript.is_empty() {
            return None;
        }
        let elapsed = self.intro_elapsed(now);
        for milestone in [
            OUTER_REVEAL,
            FRAME_REVEAL,
            BRACKETS_REVEAL,
            BAR_REVEAL,
            SLOGAN_REVEAL,
            BAR_BLINK_START,
        ] {
            if elapsed < milestone {
                return Some(milestone - elapsed);
            }
        }
        let blink_elapsed = elapsed - BAR_BLINK_START;
        let remainder = blink_elapsed.as_millis() % BAR_BLINK_HALF_PERIOD.as_millis();
        Some(Duration::from_millis(
            (BAR_BLINK_HALF_PERIOD.as_millis() - remainder) as u64,
        ))
    }
}

fn main() -> io::Result<()> {
    let (mut terminal, events) = init_terminal()?;
    let result = run(&mut terminal, &events);
    restore_terminal(&mut terminal)?;
    result
}

fn init_terminal() -> io::Result<(AppTerminal, EventReader)> {
    let mut output = PlatformTerminal::new()?;
    output.set_panic_hook(|output| {
        let _ = write!(
            output,
            "{}{}",
            alternate_screen(false),
            cursor_visible(true)
        );
        let _ = output.flush();
    });
    output.enter_raw_mode()?;
    write!(
        output,
        "{}{}",
        alternate_screen(true),
        cursor_visible(false)
    )?;
    output.flush()?;
    let events = output.event_reader();
    Ok((Terminal::new(TerminaBackend::new(output))?, events))
}

fn restore_terminal(terminal: &mut AppTerminal) -> io::Result<()> {
    let backend = terminal.backend_mut();
    write!(
        backend,
        "{}{}",
        alternate_screen(false),
        cursor_visible(true)
    )?;
    std::io::Write::flush(backend)
}

fn alternate_screen(enabled: bool) -> Csi {
    let mode = DecPrivateMode::Code(DecPrivateModeCode::ClearAndEnableAlternateScreen);
    if enabled {
        Csi::Mode(Mode::SetDecPrivateMode(mode))
    } else {
        Csi::Mode(Mode::ResetDecPrivateMode(mode))
    }
}

fn cursor_visible(visible: bool) -> Csi {
    let mode = DecPrivateMode::Code(DecPrivateModeCode::ShowCursor);
    if visible {
        Csi::Mode(Mode::SetDecPrivateMode(mode))
    } else {
        Csi::Mode(Mode::ResetDecPrivateMode(mode))
    }
}

fn run(terminal: &mut AppTerminal, events: &EventReader) -> io::Result<()> {
    let mut wrapper = MockLbeWrapper::default();
    let mut app = App {
        snapshot: wrapper.snapshot(),
        ..App::default()
    };
    while !app.should_quit {
        terminal.draw(|frame| draw(frame, &app))?;
        let now = Instant::now();
        if let Some(event) = wrapper
            .poll_event(now)
            .map_err(|error| io::Error::other(error.message))?
        {
            app.reduce_lbe_event(event);
            continue;
        }
        let timeout = match (app.next_wake(now), wrapper.next_wake(now)) {
            (Some(app_wake), Some(wrapper_wake)) => Some(app_wake.min(wrapper_wake)),
            (Some(app_wake), None) => Some(app_wake),
            (None, Some(wrapper_wake)) => Some(wrapper_wake),
            (None, None) => None,
        };
        if events.poll(timeout, |event| {
            matches!(event, Event::Key(_) | Event::WindowResized(_))
        })? {
            if let Event::Key(key) =
                events.read(|event| matches!(event, Event::Key(_) | Event::WindowResized(_)))?
            {
                app.handle_key(key, &mut wrapper, Instant::now());
            }
        }
    }
    Ok(())
}

fn draw(frame: &mut Frame, app: &App) {
    let area = frame.area();
    frame.render_widget(
        Block::default().style(Style::default().bg(PALETTE.bg)),
        area,
    );
    if area.width < MIN_WIDTH || area.height < MIN_HEIGHT {
        let message = format!(
            "LBE terminal needs at least {MIN_WIDTH}×{MIN_HEIGHT}.\nCurrent terminal: {}×{}.",
            area.width, area.height
        );
        frame.render_widget(
            Paragraph::new(message)
                .style(Style::default().fg(PALETTE.amber).bg(PALETTE.bg))
                .alignment(Alignment::Center)
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .border_style(Style::default().fg(PALETTE.line)),
                ),
            centered(area, 46, 5),
        );
        return;
    }

    let sections = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
        Constraint::Min(10),
        Constraint::Length(3),
        Constraint::Length(2),
    ])
    .split(area);
    draw_chrome(frame, sections[0]);
    draw_header(frame, sections[1], app);
    draw_body(frame, sections[2], app);
    draw_composer(frame, sections[3], app);
    draw_footer(frame, sections[4], app);
}

fn draw_chrome(frame: &mut Frame, area: Rect) {
    let line = Line::from(vec![
        Span::styled("● ● ●  ", Style::default().fg(PALETTE.line)),
        Span::styled("lbe — LBE-TUI-Lab", Style::default().fg(PALETTE.faint)),
        Span::styled(
            "                                      termina",
            Style::default().fg(PALETTE.faint),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(line).style(Style::default().bg(Color::Rgb(10, 12, 15))),
        area,
    );
}

fn draw_header(frame: &mut Frame, area: Rect, app: &App) {
    let connection = app.snapshot.connection;
    let line = Line::from(vec![
        Span::styled(
            "LETTER",
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "BLACK",
            Style::default()
                .fg(PALETTE.red)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            " ENGINE",
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!(
                "                 {} {} · UI CONTRACT PREVIEW",
                connection.marker(),
                connection.label()
            ),
            Style::default().fg(connection.color()),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(line).style(Style::default().bg(PALETTE.bg)),
        area,
    );
}

fn draw_body(frame: &mut Frame, area: Rect, app: &App) {
    let content = if let Some(panel) = app.panel {
        mock_panel_text(panel, &app.snapshot)
    } else if app.show_shortcuts {
        shortcut_text()
    } else if app.transcript.is_empty() {
        welcome_text(area.height, app.intro_elapsed(Instant::now()))
    } else {
        transcript_text(app)
    };
    frame.render_widget(
        Paragraph::new(content)
            .alignment(Alignment::Center)
            .style(Style::default().fg(PALETTE.ink).bg(PALETTE.bg))
            .wrap(Wrap { trim: true }),
        area.inner(Margin::new(2, 0)),
    );
}

fn draw_composer(frame: &mut Frame, area: Rect, app: &App) {
    let rows = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(area);

    let rule = "─".repeat(area.width as usize);
    frame.render_widget(
        Paragraph::new(rule.clone()).style(Style::default().fg(PALETTE.line).bg(PALETTE.bg)),
        rows[0],
    );

    let composer_text = match &app.phase {
        Phase::AwaitingApproval { proposal, .. } => {
            format!("> {proposal}   [Enter] approve   [Esc] reject")
        }
        Phase::Running => "> Execution in progress…".to_owned(),
        _ if app.input.is_empty() => format!("> {}", mode_placeholder(app.agent_mode)),
        _ => format!("> {}", app.input),
    };

    let composer_style = if matches!(app.phase, Phase::Running) {
        Style::default().fg(PALETTE.muted)
    } else {
        Style::default().fg(PALETTE.ink)
    };

    frame.render_widget(
        Paragraph::new(composer_text).style(composer_style.bg(PALETTE.bg)),
        rows[1],
    );

    frame.render_widget(
        Paragraph::new(rule).style(Style::default().fg(PALETTE.line).bg(PALETTE.bg)),
        rows[2],
    );
}

fn draw_footer(frame: &mut Frame, area: Rect, app: &App) {
    let rows = Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).split(area);

    let shortcut_label = if app.show_shortcuts {
        "? close shortcuts"
    } else {
        "? for shortcuts"
    };

    let top = Layout::horizontal([
        Constraint::Percentage(20),
        Constraint::Percentage(60),
        Constraint::Percentage(20),
    ])
    .split(rows[0]);

    frame.render_widget(
        Paragraph::new(shortcut_label)
            .style(Style::default().fg(PALETTE.faint).bg(PALETTE.bg))
            .alignment(Alignment::Left),
        top[0],
    );

    let mode_line = Line::from(vec![
        mode_indicator("Lbe Audit", app.agent_mode == AgentMode::Audit),
        Span::styled("/", Style::default().fg(PALETTE.faint)),
        mode_indicator("Agent regular", app.agent_mode == AgentMode::Regular),
        Span::styled("/", Style::default().fg(PALETTE.faint)),
        mode_indicator("Plan", app.agent_mode == AgentMode::Plan),
        Span::styled(" (Tab)", Style::default().fg(PALETTE.faint)),
    ]);
    frame.render_widget(
        Paragraph::new(mode_line)
            .style(Style::default().bg(PALETTE.bg))
            .alignment(Alignment::Center),
        top[1],
    );

    let model_status = match &app.snapshot.effort_label {
        Some(effort) if !effort.is_empty() => format!("{}· {}", app.snapshot.model_id, effort),
        _ => app.snapshot.model_id.clone(),
    };
    frame.render_widget(
        Paragraph::new(model_status)
            .style(Style::default().fg(PALETTE.faint).bg(PALETTE.bg))
            .alignment(Alignment::Right),
        top[2],
    );

    let bottom =
        Layout::horizontal([Constraint::Percentage(50), Constraint::Percentage(50)]).split(rows[1]);

    frame.render_widget(
        Paragraph::new(app.snapshot.workspace_label.clone())
            .style(Style::default().fg(PALETTE.muted).bg(PALETTE.bg))
            .alignment(Alignment::Left),
        bottom[0],
    );

    let meter = context_meter(app.snapshot.context_used, app.snapshot.context_capacity, 10);
    let context_line = Line::from(vec![
        Span::styled(
            format!("{} (Context) ", app.snapshot.model_family),
            Style::default().fg(PALETTE.faint),
        ),
        Span::styled(meter, Style::default().fg(PALETTE.red)),
    ]);
    frame.render_widget(
        Paragraph::new(context_line)
            .style(Style::default().bg(PALETTE.bg))
            .alignment(Alignment::Right),
        bottom[1],
    );
}

fn context_meter(used: usize, capacity: usize, width: usize) -> String {
    if capacity == 0 || width == 0 {
        return String::new();
    }

    let filled = ((used.min(capacity) as f64 / capacity as f64) * width as f64).round() as usize;
    let filled = filled.min(width);

    // Preserve the requested terminal vocabulary:
    // filled cells are blocks; remaining context is shown as vertical marks.
    format!("{} {}", "█".repeat(filled), "|".repeat(width - filled))
}

fn mode_indicator(label: &'static str, selected: bool) -> Span<'static> {
    let marker = if selected { "●" } else { "○" };
    let style = if selected {
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(PALETTE.faint)
    };
    Span::styled(format!("{marker} {label}"), style)
}

fn shortcut_text() -> Text<'static> {
    Text::from(vec![
        Line::from(Span::styled(
            "Keyboard shortcuts",
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        )),
        Line::default(),
        Line::from("Enter   propose a task / approve a pending proposal"),
        Line::from("Esc     reject a pending proposal / close active overlay"),
        Line::from("Tab     cycle LBE Audit, Agent regular, and Plan"),
        Line::from("↑/↓     recall submitted mock input history"),
        Line::from("Ctrl+L  clear rendered mock transcript"),
        Line::from("Ctrl+D  exit when the composer is empty"),
        Line::from("?       close this shortcut reference"),
        Line::from("q       quit when the task input is empty"),
        Line::from("Ctrl+C  quit cleanly"),
    ])
}

fn mode_placeholder(mode: AgentMode) -> &'static str {
    match mode {
        AgentMode::Audit => "Inspect workspace evidence (mock-only)",
        AgentMode::Regular => "Describe a governed task",
        AgentMode::Plan => "Investigate or propose a plan (no execution)",
    }
}

fn mock_panel_text(panel: MockPanel, snapshot: &LbeSnapshot) -> Text<'static> {
    let (title, rows): (&str, Vec<String>) = match panel {
        MockPanel::Account => (
            "Account",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Canonical account/auth state is runtime-owned.".to_owned(),
            ],
        ),
        MockPanel::Provider => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock provider catalog; no credentials, network, or provider calls.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.providers.iter().map(|provider| {
                let local = if provider.is_local { " · LOCAL" } else { "" };
                format!(
                    "{}  {} · {}{}",
                    provider.provider_id.label(),
                    provider.auth_state.label(),
                    provider.health.label(),
                    local
                )
            }));
            ("Providers", rows)
        }
        MockPanel::Model => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock provider-discovered catalog; capability values are not live.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.models.iter().map(|model| {
                format!(
                    "{} · {} · context {} · output {}",
                    model.provider_id.label(),
                    model.display_name,
                    model
                        .context_window
                        .map_or_else(|| "unknown".to_owned(), |value| value.to_string()),
                    model
                        .max_output_tokens
                        .map_or_else(|| "unknown".to_owned(), |value| value.to_string())
                )
            }));
            rows.extend(snapshot.models.iter().map(|model| {
                format!(
                    "  streaming {} · tools {} · reasoning {} · images {} · caching {}",
                    capability_marker(model.capabilities.streaming),
                    capability_marker(model.capabilities.tools),
                    capability_marker(model.capabilities.reasoning),
                    capability_marker(model.capabilities.images),
                    capability_marker(model.capabilities.prompt_caching),
                )
            }));
            ("Models", rows)
        }
        MockPanel::Mcp => (
            "MCP",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "No MCP server registry or transport is connected.".to_owned(),
            ],
        ),
        MockPanel::Tools => (
            "Tools",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "No canonical typed tool registry or policy is connected.".to_owned(),
            ],
        ),
        MockPanel::History => (
            "History",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Only in-memory composer recall is available.".to_owned(),
            ],
        ),
        MockPanel::Session => {
            let lineage = &snapshot.lineage;
            let parent = lineage
                .parent_session_id
                .as_deref()
                .unwrap_or("none");
            (
                "Session",
                vec![
                    "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                    format!(
                        "Root {} · parent {} · origin {}",
                        lineage.root_session_id,
                        parent,
                        lineage.origin.label()
                    ),
                    "No durable session owner is connected.".to_owned(),
                ],
            )
        }
        MockPanel::Evidence => (
            "Evidence",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Current evidence refs require canonical LBE runtime output.".to_owned(),
            ],
        ),
        MockPanel::Receipts => (
            "Receipts",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Mock receipt rcpt_demo_7f31 is not a canonical receipt.".to_owned(),
            ],
        ),
        MockPanel::Status => (
            "Status",
            vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                format!(
                    "Runtime {} · {} · attached clients {}",
                    snapshot.runtime_id.as_deref().unwrap_or("not attached"),
                    snapshot.runtime_mode.label(),
                    snapshot.attached_client_count
                ),
                format!(
                    "Session {} · compaction {} · retry {}/{} · timeout {}/{}s",
                    snapshot.session_state.label(),
                    snapshot.compaction_state.label(),
                    snapshot.retry_count,
                    snapshot.retry_limit,
                    snapshot.elapsed_seconds,
                    snapshot.timeout_seconds
                ),
                "All values are mock projections; no runtime is attached.".to_owned(),
            ],
        ),
        MockPanel::Undo => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Checkpoint projection; restore originates from the canonical LBE runtime."
                    .to_owned(),
                String::new(),
            ];
            if let Some(checkpoint) = &snapshot.latest_checkpoint {
                rows.push(format!(
                    "{} · {} · {} file(s) changed",
                    checkpoint.checkpoint_id,
                    checkpoint.created_at,
                    checkpoint.changed_files.len()
                ));
                rows.push(format!(
                    "workspace revision {}",
                    checkpoint.workspace_revision
                ));
            } else {
                rows.push("No checkpoint has been created in this mock session.".to_owned());
            }
            ("Undo", rows)
        }
        MockPanel::Doctor => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock diagnostics; no live checks are executed.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.diagnostics.iter().map(|check| {
                let remediation = if check.remediation_available {
                    " · remediation available"
                } else {
                    ""
                };
                format!(
                    "{}  {} · {} · {}{}",
                    check.status.label(),
                    check.category,
                    check.id,
                    check.message,
                    remediation
                )
            }));
            ("Doctor", rows)
        }
    };
    let mut lines = vec![
        Line::from(Span::styled(
            title,
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        )),
        Line::default(),
    ];
    lines.extend(
        rows.into_iter()
            .map(|row| Line::from(Span::styled(row, Style::default().fg(PALETTE.muted)))),
    );
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Esc closes this view",
        Style::default().fg(PALETTE.faint),
    )));
    Text::from(lines)
}

fn capability_marker(enabled: bool) -> &'static str {
    if enabled { "●" } else { "○" }
}

fn welcome_text(available_height: u16, elapsed: Duration) -> Text<'static> {
    let mut lines = logo_lines(elapsed);
    if available_height < 21 || elapsed < SLOGAN_REVEAL {
        return Text::from(lines);
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "What can I do for you?",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    lines.push(Line::from(vec![
        Span::styled("Your agents propose. ", Style::default().fg(PALETTE.muted)),
        Span::styled(
            "LBE decides.",
            Style::default()
                .fg(PALETTE.red)
                .add_modifier(Modifier::BOLD),
        ),
    ]));
    Text::from(lines)
}

fn transcript_text(app: &App) -> Text<'static> {
    let mut lines = Vec::new();
    for entry in &app.transcript {
        let style = if entry.contains("PASS") {
            Style::default().fg(PALETTE.green)
        } else if entry.contains("REJECTED") {
            Style::default().fg(PALETTE.amber)
        } else if entry.starts_with("you") {
            Style::default().fg(Color::Rgb(117, 185, 239))
        } else {
            Style::default().fg(PALETTE.ink)
        };
        lines.push(Line::from(Span::styled(entry.clone(), style)));
        lines.push(Line::default());
    }
    Text::from(lines)
}

fn logo_lines(elapsed: Duration) -> Vec<Line<'static>> {
    LOGO.iter()
        .enumerate()
        .map(|(row, line)| {
            let mut spans = Vec::new();
            let mut segment = String::new();
            let mut active_style = Style::default().fg(PALETTE.logo_outer);

            for (column, character) in line.chars().enumerate() {
                let style = if logo_cell_visible(row, column, elapsed) {
                    logo_cell_style(row, column)
                } else {
                    Style::default().fg(PALETTE.bg)
                };
                if style != active_style && !segment.is_empty() {
                    spans.push(Span::styled(std::mem::take(&mut segment), active_style));
                    active_style = style;
                }
                segment.push(character);
            }
            if !segment.is_empty() {
                spans.push(Span::styled(segment, active_style));
            }
            Line::from(spans)
        })
        .collect()
}

fn logo_cell_visible(row: usize, column: usize, elapsed: Duration) -> bool {
    let outer =
        row == 0 || row == 16 || ((1..=15).contains(&row) && matches!(column, 0 | 1 | 37 | 38));
    let inner_frame = (matches!(row, 2 | 14) && (5..=33).contains(&column))
        || ((3..=13).contains(&row) && matches!(column, 5 | 33));
    let brackets = (matches!(row, 4 | 12)
        && ((9..=16).contains(&column) || (22..=29).contains(&column)))
        || ((5..=11).contains(&row) && matches!(column, 9 | 29));
    let center_bar = (5..=11).contains(&row) && column == 19 && center_bar_visible(elapsed);

    (elapsed >= OUTER_REVEAL && outer)
        || (elapsed >= FRAME_REVEAL && inner_frame)
        || (elapsed >= BRACKETS_REVEAL && brackets)
        || (elapsed >= BAR_REVEAL && center_bar)
}

fn center_bar_visible(elapsed: Duration) -> bool {
    if elapsed < BAR_REVEAL {
        return false;
    }
    if elapsed < BAR_BLINK_START {
        return true;
    }
    ((elapsed - BAR_BLINK_START).as_millis() / BAR_BLINK_HALF_PERIOD.as_millis()) % 2 == 1
}

fn logo_cell_style(row: usize, column: usize) -> Style {
    let red_inner_top_or_bottom = matches!(row, 2 | 14) && (5..=33).contains(&column);
    let red_inner_side = (3..=13).contains(&row) && matches!(column, 5 | 33);
    let red_center_bar = (5..=11).contains(&row) && column == 19;
    if red_inner_top_or_bottom || red_inner_side || red_center_bar {
        Style::default().fg(PALETTE.red)
    } else {
        Style::default().fg(PALETTE.logo_outer)
    }
}

fn centered(area: Rect, width: u16, height: u16) -> Rect {
    let width = width.min(area.width);
    let height = height.min(area.height);
    Rect::new(
        area.x + (area.width - width) / 2,
        area.y + (area.height - height) / 2,
        width,
        height,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::backend::TestBackend;

    #[test]
    fn proposal_approval_lifecycle_reaches_receipt() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        app.input = "inspect workspace".to_owned();
        app.submit_or_approve(&mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert!(matches!(
            app.phase,
            Phase::AwaitingApproval { ref approval_id, .. } if approval_id == "apr_mock_7f31"
        ));
        app.submit_or_approve(&mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.phase, Phase::Running);
        let finished_at = now + Duration::from_millis(950);
        while let Some(event) = wrapper.poll_event(finished_at).unwrap() {
            app.reduce_lbe_event(event);
        }
        assert_eq!(app.phase, Phase::Completed);
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("TOOL  REQUESTED · workspace.inspect"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("VALIDATION  PASSED"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("COMPLETION ACCEPTED · exec_mock_7f31"))
        );
    }

    #[test]
    fn escape_rejects_only_a_pending_proposal() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        app.input = "inspect workspace".to_owned();
        let now = Instant::now();
        app.submit_or_approve(&mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        app.dismiss_or_reject(&mut wrapper);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.phase, Phase::Rejected);
        assert!(app.transcript.iter().any(|line| line.contains("REJECTED")));
    }

    #[test]
    fn mock_wrapper_rejects_an_unknown_approval_id() {
        let mut wrapper = MockLbeWrapper::default();
        wrapper
            .submit(
                UserRequest::SubmitTask {
                    intent: "inspect workspace".to_owned(),
                    mode: AgentMode::Regular,
                },
                Instant::now(),
            )
            .unwrap();

        let error = wrapper
            .submit(
                UserRequest::Approve {
                    approval_id: "apr_wrong".to_owned(),
                },
                Instant::now(),
            )
            .expect_err("unknown approvals must remain runtime-owned");

        assert!(error.message.contains("not pending"));
    }

    #[test]
    fn continuation_requires_the_active_session_and_projects_assistant_text() {
        let mut wrapper = MockLbeWrapper::default();
        let session_id = wrapper
            .snapshot()
            .session_id
            .expect("mock wrapper must project a current session ID");

        wrapper
            .submit(
                UserRequest::Continue {
                    session_id: session_id.clone(),
                    message: "summarize the prior result".to_owned(),
                },
                Instant::now(),
            )
            .unwrap();

        let mut app = App::default();
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.snapshot.turn_id.as_deref(), Some("turn_mock_1"));
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("Mock follow-up received"))
        );

        let error = wrapper
            .submit(
                UserRequest::Continue {
                    session_id: "sess_wrong".to_owned(),
                    message: "should fail".to_owned(),
                },
                Instant::now(),
            )
            .expect_err("continuations must remain bound to the runtime session");
        assert!(error.message.contains("not active"));
    }

    #[test]
    fn commands_open_mock_panels_without_claiming_runtime_integration() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        app.handle_command("/tools", &mut wrapper);
        assert_eq!(app.panel, Some(MockPanel::Tools));
        let text = mock_panel_text(MockPanel::Tools, &app.snapshot).to_string();
        assert!(text.contains("MOCK / NOT CONNECTED"));
    }

    #[test]
    fn mock_provider_catalog_events_and_panels_project_safe_typed_values() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        app.handle_command("/provider", &mut wrapper);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }

        let provider_text = mock_panel_text(MockPanel::Provider, &app.snapshot).to_string();
        assert!(provider_text.contains("Google Gemini  READY · READY"));
        assert!(provider_text.contains("LM Studio  READY · READY · LOCAL"));
        assert!(provider_text.contains("Ollama  NOT CONFIGURED · OFFLINE · LOCAL"));
        assert!(!provider_text.contains("credential_ref"));
        assert!(!provider_text.contains("Authorization:"));

        app.handle_command("/model", &mut wrapper);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        let model_text = mock_panel_text(MockPanel::Model, &app.snapshot).to_string();
        assert!(model_text.contains("Gemini 2.5 Flash Preview"));
        assert!(model_text.contains("streaming ● · tools ● · reasoning ● · images ●"));
        assert_eq!(
            app.snapshot
                .selected_model
                .as_ref()
                .map(|model| model.provider_id),
            Some(ProviderId::Gemini)
        );
    }

    #[test]
    fn compact_and_doctor_commands_render_mock_runtime_projections() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();

        app.handle_command("/compact", &mut wrapper);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        assert_eq!(app.snapshot.context_used, 1);
        assert_eq!(app.snapshot.compaction_state, CompactionState::Completed);
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("CONTEXT  compaction completed"))
        );

        app.handle_command("/doctor", &mut wrapper);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        assert_eq!(app.panel, Some(MockPanel::Doctor));
        let doctor_text = mock_panel_text(MockPanel::Doctor, &app.snapshot).to_string();
        assert!(doctor_text.contains("Mock diagnostics; no live checks are executed."));
        assert!(doctor_text.contains("runtime.mock"));
        assert!(doctor_text.contains("terminal.termina"));
    }

    #[test]
    fn select_model_rejects_a_model_not_in_the_discovered_catalog() {
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        let result = wrapper.submit(
            UserRequest::SelectModel {
                model: ModelRef {
                    provider_id: ProviderId::Anthropic,
                    model_id: "claude-invented-99".to_owned(),
                },
            },
            now,
        );
        assert!(result.is_err());
        assert_eq!(
            wrapper
                .snapshot
                .selected_model
                .as_ref()
                .map(|model| model.model_id.as_str()),
            Some("gemini-2.5-flash-preview")
        );
    }

    #[test]
    fn select_model_accepts_a_model_present_in_the_discovered_catalog() {
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        let result = wrapper.submit(
            UserRequest::SelectModel {
                model: ModelRef {
                    provider_id: ProviderId::Gemini,
                    model_id: "gemini-2.5-flash-preview".to_owned(),
                },
            },
            now,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn provider_refresh_emits_discovery_and_validation_lifecycle() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        app.handle_command("/provider", &mut wrapper);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("PROVIDER  discovery started"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("PROVIDER  discovery completed"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("PROVIDER  validation started · Google Gemini"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("PROVIDER  validation completed · LM Studio"))
        );
    }

    #[test]
    fn session_lineage_and_checkpoint_project_into_their_panels() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        app.input = "inspect workspace".to_owned();
        app.submit_or_approve(&mut wrapper, now);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        app.submit_or_approve(&mut wrapper, now);
        while let Some(event) = wrapper
            .poll_event(now + Duration::from_millis(950))
            .unwrap()
        {
            app.reduce_lbe_event(event);
        }

        let session_text = mock_panel_text(MockPanel::Session, &app.snapshot).to_string();
        assert!(session_text.contains("Root sess_mock_7f31 · parent none · origin user"));

        let undo_text = mock_panel_text(MockPanel::Undo, &app.snapshot).to_string();
        assert!(undo_text.contains("chk_mock_before_exec"));
        assert!(!undo_text.contains("No checkpoint has been created"));
    }

    #[test]
    fn execution_projects_checkpoint_and_command_streams_without_spawning_a_process() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        app.input = "inspect workspace".to_owned();
        app.submit_or_approve(&mut wrapper, now);
        while let Some(event) = wrapper.poll_event(Instant::now()).unwrap() {
            app.reduce_lbe_event(event);
        }
        assert_eq!(
            app.snapshot.session_state,
            SessionStatus::WaitingForApproval
        );

        app.submit_or_approve(&mut wrapper, now);
        while let Some(event) = wrapper
            .poll_event(now + Duration::from_millis(950))
            .unwrap()
        {
            app.reduce_lbe_event(event);
        }

        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("CHECKPOINT  created · chk_mock_before_exec"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("STDOUT cmd_mock_check"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("STDERR cmd_mock_check"))
        );
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("COMMAND  completed · cmd_mock_check · exit 0"))
        );
        assert_eq!(app.phase, Phase::Completed);
    }

    #[test]
    fn plan_and_audit_submissions_do_not_enter_execution_flow() {
        let now = Instant::now();
        let mut wrapper = MockLbeWrapper::default();
        let mut plan = App {
            agent_mode: AgentMode::Plan,
            input: "inspect architecture".to_owned(),
            ..App::default()
        };
        plan.submit_or_approve(&mut wrapper, now);
        plan.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(plan.phase, Phase::Welcome);
        assert!(plan.transcript.iter().any(|line| line.starts_with("PLAN")));

        let mut audit = App {
            agent_mode: AgentMode::Audit,
            input: "inspect workspace".to_owned(),
            ..App::default()
        };
        audit.submit_or_approve(&mut wrapper, now);
        audit.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(audit.phase, Phase::Welcome);
        assert!(
            audit
                .transcript
                .iter()
                .any(|line| line.starts_with("AUDIT"))
        );
    }

    #[test]
    fn history_recall_returns_submitted_input() {
        let mut app = App::default();
        app.input_history = vec!["first task".to_owned(), "second task".to_owned()];
        app.recall_history(true);
        assert_eq!(app.input, "second task");
        app.recall_history(true);
        assert_eq!(app.input, "first task");
        app.recall_history(false);
        assert_eq!(app.input, "second task");
    }

    #[test]
    fn tab_cycles_the_visible_agent_modes() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        assert_eq!(app.agent_mode, AgentMode::Regular);
        app.handle_key(KeyCode::Tab.into(), &mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.agent_mode, AgentMode::Plan);
        app.handle_key(KeyCode::Tab.into(), &mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.agent_mode, AgentMode::Audit);
        app.handle_key(KeyCode::Tab.into(), &mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.agent_mode, AgentMode::Regular);
    }

    #[test]
    fn question_mark_toggles_the_shortcut_reference() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        let now = Instant::now();
        app.handle_key(KeyCode::Char('?').into(), &mut wrapper, now);
        assert!(app.show_shortcuts);
        app.handle_key(KeyCode::Char('?').into(), &mut wrapper, now);
        assert!(!app.show_shortcuts);
    }

    #[test]
    fn wrapper_snapshot_owns_footer_projection() {
        let mut wrapper = MockLbeWrapper::default();
        let snapshot = wrapper.snapshot();
        assert_eq!(snapshot.connection, RuntimeConnection::Mock);
        assert_eq!(snapshot.connection.label(), "MOCK / NOT CONNECTED");
        wrapper
            .submit(
                UserRequest::SetMode {
                    mode: AgentMode::Plan,
                },
                Instant::now(),
            )
            .unwrap();
        let event = wrapper.poll_event(Instant::now()).unwrap().unwrap();
        let mut app = App::default();
        app.reduce_lbe_event(event);
        assert_eq!(app.snapshot.active_mode, AgentMode::Plan);
        assert_eq!(app.agent_mode, AgentMode::Plan);
    }

    #[test]
    fn welcome_frame_renders_the_supplied_logo_at_80_by_24() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).expect("test terminal should initialize");
        let mut app = App::default();
        app.intro_started_at = Instant::now() - Duration::from_millis(1800);
        terminal
            .draw(|frame| draw(frame, &app))
            .expect("frame should render");
        let rendered = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>();
        assert!(rendered.contains("LETTERBLACK ENGINE"));
        assert!(rendered.contains("○ MOCK / NOT CONNECTED"));
        assert!(rendered.contains("UI CONTRACT PREVIEW"));
        assert!(!rendered.contains("runtime connected"));
        assert!(rendered.contains("███████████████████████████████████████"));
        assert!(rendered.contains("? for shortcuts"));
        assert!(rendered.contains("Agent regular"));
        assert!(rendered.contains("C:\\Users\\"));
        assert!(rendered.contains("Model ID· low"));
        assert!(rendered.contains("Gemini (Context)"));
        assert!(rendered.contains("Lbe Audit"));
        assert!(rendered.contains("Plan"));
        assert!(rendered.contains("(Tab)"));
    }

    #[test]
    fn supplied_logo_keeps_its_fixed_geometry() {
        assert_eq!(LOGO.len(), 17);
        assert!(LOGO.iter().all(|line| line.chars().count() == 39));
        assert_eq!(LOGO[0], "███████████████████████████████████████");
        assert_eq!(LOGO[4], "██   █   ████████     ████████   █   ██");
    }

    #[test]
    fn inner_logo_frame_uses_native_red_styles() {
        assert_eq!(logo_cell_style(2, 5).fg, Some(PALETTE.red));
        assert_eq!(logo_cell_style(2, 33).fg, Some(PALETTE.red));
        assert_eq!(logo_cell_style(8, 5).fg, Some(PALETTE.red));
        assert_eq!(logo_cell_style(8, 33).fg, Some(PALETTE.red));
        assert_eq!(logo_cell_style(8, 19).fg, Some(PALETTE.red));
        assert_eq!(logo_cell_style(0, 0).fg, Some(PALETTE.logo_outer));
        assert_eq!(logo_cell_style(8, 6).fg, Some(PALETTE.logo_outer));
    }

    #[test]
    fn intro_animation_follows_the_reference_reveal_order() {
        assert!(!logo_cell_visible(0, 0, Duration::ZERO));
        assert!(logo_cell_visible(0, 0, OUTER_REVEAL));
        assert!(!logo_cell_visible(2, 5, OUTER_REVEAL));
        assert!(logo_cell_visible(2, 5, FRAME_REVEAL));
        assert!(!logo_cell_visible(4, 9, FRAME_REVEAL));
        assert!(logo_cell_visible(4, 9, BRACKETS_REVEAL));
        assert!(!logo_cell_visible(5, 19, BRACKETS_REVEAL));
        assert!(logo_cell_visible(5, 19, BAR_REVEAL));
    }

    #[test]
    fn intro_center_bar_blinks_after_the_reference_delay() {
        assert!(center_bar_visible(Duration::from_millis(1300)));
        assert!(!center_bar_visible(BAR_BLINK_START));
        assert!(center_bar_visible(BAR_BLINK_START + BAR_BLINK_HALF_PERIOD));
    }

    #[test]
    fn context_meter_uses_blocks_for_used_and_marks_for_remaining() {
        assert_eq!(context_meter(2, 10, 10), "██ ||||||||");
        assert_eq!(context_meter(10, 10, 10), "██████████ ");
        assert_eq!(context_meter(0, 10, 10), " ||||||||||");
    }

    #[test]
    fn below_minimum_size_shows_an_honest_fallback() {
        let backend = TestBackend::new(59, 17);
        let mut terminal = Terminal::new(backend).expect("test terminal should initialize");
        terminal
            .draw(|frame| draw(frame, &App::default()))
            .expect("frame should render");
        let rendered = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>();
        assert!(rendered.contains("LBE terminal needs at least 60×18."));
    }
}
