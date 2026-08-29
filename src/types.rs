use std::time::Duration;

use ratatui::style::Color;

use crate::{browser_chat::BrowserChatProjection, memory::MemoryProjection};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub(crate) const MIN_WIDTH: u16 = 60;
pub(crate) const MIN_HEIGHT: u16 = 18;
pub(crate) const OUTER_REVEAL: Duration = Duration::from_millis(100);
pub(crate) const FRAME_REVEAL: Duration = Duration::from_millis(300);
pub(crate) const BRACKETS_REVEAL: Duration = Duration::from_millis(700);
pub(crate) const BAR_REVEAL: Duration = Duration::from_millis(1100);
pub(crate) const SLOGAN_REVEAL: Duration = Duration::from_millis(1300);
pub(crate) const BAR_BLINK_START: Duration = Duration::from_millis(1400);
pub(crate) const BAR_BLINK_HALF_PERIOD: Duration = Duration::from_millis(450);

pub(crate) const LOGO: [&str; 17] = [
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

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
pub(crate) struct Palette {
    pub(crate) bg: Color,
    pub(crate) ink: Color,
    pub(crate) muted: Color,
    pub(crate) faint: Color,
    pub(crate) line: Color,
    pub(crate) red: Color,
    pub(crate) green: Color,
    pub(crate) amber: Color,
    pub(crate) logo_outer: Color,
}

pub(crate) const PALETTE: Palette = Palette {
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

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Phase {
    Welcome,
    AwaitingApproval {
        approval_id: String,
        proposal: String,
    },
    Running,
    Completed,
    Failed,
    TimedOut,
    Aborted,
    Rejected,
}

impl Phase {
    pub(crate) fn from_session_status(status: SessionStatus) -> Self {
        match status {
            SessionStatus::Idle | SessionStatus::WaitingForInput => Self::Welcome,
            SessionStatus::Running => Self::Running,
            SessionStatus::WaitingForApproval => Self::Welcome,
            SessionStatus::Completed => Self::Completed,
            SessionStatus::Failed => Self::Failed,
            SessionStatus::TimedOut => Self::TimedOut,
            SessionStatus::Aborted => Self::Aborted,
            SessionStatus::Rejected => Self::Rejected,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExecutionStatus {
    Pending,
    WaitingForApproval,
    Running,
    Validating,
    Completed,
    Failed,
    TimedOut,
    Aborted,
    Rejected,
}

impl ExecutionStatus {
    pub(crate) fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::TimedOut | Self::Aborted | Self::Rejected
        )
    }

    pub(crate) fn session_status(self) -> SessionStatus {
        match self {
            Self::Pending => SessionStatus::Idle,
            Self::WaitingForApproval => SessionStatus::WaitingForApproval,
            Self::Running | Self::Validating => SessionStatus::Running,
            Self::Completed => SessionStatus::Completed,
            Self::Failed => SessionStatus::Failed,
            Self::TimedOut => SessionStatus::TimedOut,
            Self::Aborted => SessionStatus::Aborted,
            Self::Rejected => SessionStatus::Rejected,
        }
    }
}

// ---------------------------------------------------------------------------
// AgentMode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AgentMode {
    Audit,
    Regular,
    Plan,
}

impl AgentMode {
    pub(crate) fn next(self) -> Self {
        match self {
            Self::Audit => Self::Regular,
            Self::Regular => Self::Plan,
            Self::Plan => Self::Audit,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Audit => "Lbe Audit",
            Self::Regular => "Agent regular",
            Self::Plan => "Plan",
        }
    }
}

// ---------------------------------------------------------------------------
// RuntimeConnection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RuntimeConnection {
    Mock,
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Lost,
}

impl RuntimeConnection {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Mock => "MOCK / NOT CONNECTED",
            Self::Disconnected => "DISCONNECTED",
            Self::Connecting => "CONNECTING",
            Self::Connected => "CONNECTED",
            Self::Reconnecting => "RECONNECTING",
            Self::Lost => "CONNECTION LOST",
        }
    }

    pub(crate) fn marker(self) -> &'static str {
        match self {
            Self::Connected => "●",
            Self::Connecting | Self::Reconnecting => "◐",
            Self::Mock | Self::Disconnected | Self::Lost => "○",
        }
    }

    pub(crate) fn color(self) -> Color {
        match self {
            Self::Connected => PALETTE.green,
            Self::Connecting | Self::Reconnecting => PALETTE.amber,
            Self::Lost => PALETTE.red,
            Self::Mock | Self::Disconnected => PALETTE.faint,
        }
    }
}

// ---------------------------------------------------------------------------
// LbeSnapshot
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LbeSnapshot {
    pub(crate) runtime_id: Option<String>,
    pub(crate) runtime_mode: RuntimeMode,
    pub(crate) attached_client_count: usize,
    pub(crate) lineage: SessionLineage,
    pub(crate) session_id: Option<String>,
    pub(crate) session_state: SessionStatus,
    pub(crate) turn_id: Option<String>,
    pub(crate) workspace_id: Option<String>,
    pub(crate) workspace_label: String,
    pub(crate) model_id: String,
    pub(crate) model_family: String,
    pub(crate) effort_label: Option<String>,
    pub(crate) context_used: usize,
    pub(crate) context_capacity: usize,
    pub(crate) compaction_available: bool,
    pub(crate) compaction_state: CompactionState,
    pub(crate) latest_checkpoint: Option<CheckpointDescriptor>,
    pub(crate) retry_count: u32,
    pub(crate) retry_limit: u32,
    pub(crate) timeout_seconds: u64,
    pub(crate) elapsed_seconds: u64,
    pub(crate) active_execution_id: Option<String>,
    pub(crate) execution_status: Option<ExecutionStatus>,
    pub(crate) diagnostics: Vec<DiagnosticCheck>,
    pub(crate) active_mode: AgentMode,
    pub(crate) connection: RuntimeConnection,
    pub(crate) providers: Vec<ProviderProjection>,
    pub(crate) models: Vec<ModelDescriptor>,
    pub(crate) selected_model: Option<ModelRef>,
    pub(crate) memory: MemoryProjection,
    pub(crate) browser_chat: BrowserChatProjection,
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
            active_execution_id: None,
            execution_status: None,
            diagnostics: mock_diagnostics(),
            active_mode: AgentMode::Regular,
            connection: RuntimeConnection::Mock,
            providers: mock_provider_catalog(),
            models: mock_model_catalog(),
            selected_model: Some(ModelRef {
                provider_id: ProviderId::Gemini,
                model_id: "gemini-2.5-flash-preview".to_owned(),
            }),
            memory: MemoryProjection::default(),
            browser_chat: BrowserChatProjection::default(),
        }
    }
}
// ---------------------------------------------------------------------------
// RuntimeMode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RuntimeMode {
    Mock,
    Local,
    Hub,
    Detached,
}

impl RuntimeMode {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Mock => "MOCK",
            Self::Local => "LOCAL",
            Self::Hub => "HUB",
            Self::Detached => "DETACHED",
        }
    }
}

// ---------------------------------------------------------------------------
// Provider types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum ProviderId {
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
    pub(crate) fn label(self) -> &'static str {
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
pub(crate) struct CredentialRef(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderConfig {
    pub(crate) provider_id: ProviderId,
    pub(crate) base_url: Option<String>,
    pub(crate) credential_ref: Option<CredentialRef>,
    pub(crate) headers: Vec<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AuthState {
    NotConfigured,
    Configured,
    Validating,
    Ready,
    Error,
}

impl AuthState {
    pub(crate) fn label(self) -> &'static str {
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
pub(crate) enum ProviderHealth {
    Unknown,
    Ready,
    Offline,
    Error,
}

impl ProviderHealth {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Unknown => "UNKNOWN",
            Self::Ready => "READY",
            Self::Offline => "OFFLINE",
            Self::Error => "ERROR",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderCapabilities {
    pub(crate) streaming: bool,
    pub(crate) tools: bool,
    pub(crate) reasoning: bool,
    pub(crate) images: bool,
    pub(crate) prompt_caching: bool,
    pub(crate) max_context: Option<u32>,
    pub(crate) max_output: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelRef {
    pub(crate) provider_id: ProviderId,
    pub(crate) model_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelDescriptor {
    pub(crate) provider_id: ProviderId,
    pub(crate) model_id: String,
    pub(crate) display_name: String,
    pub(crate) context_window: Option<u32>,
    pub(crate) max_output_tokens: Option<u32>,
    pub(crate) capabilities: ProviderCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderProjection {
    pub(crate) provider_id: ProviderId,
    pub(crate) auth_state: AuthState,
    pub(crate) health: ProviderHealth,
    pub(crate) is_local: bool,
}

// ---------------------------------------------------------------------------
// Model / Provider intermediate types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Message {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ToolDefinition {
    pub(crate) name: String,
    pub(crate) description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelRequest {
    pub(crate) model: ModelRef,
    pub(crate) messages: Vec<Message>,
    pub(crate) tools: Vec<ToolDefinition>,
    pub(crate) stream: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ModelEvent {
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
pub(crate) struct Usage {
    pub(crate) input_tokens: u64,
    pub(crate) output_tokens: u64,
    pub(crate) cached_tokens: Option<u64>,
    pub(crate) cost_micros: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FinishReason {
    Stop,
    ToolCall,
    Length,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderError {
    pub(crate) provider_id: ProviderId,
    pub(crate) code: Option<String>,
    pub(crate) message: String,
}

// ---------------------------------------------------------------------------
// Mock catalog data
// ---------------------------------------------------------------------------

pub(crate) fn mock_provider_catalog() -> Vec<ProviderProjection> {
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

pub(crate) fn mock_model_catalog() -> Vec<ModelDescriptor> {
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
// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionStatus {
    Idle,
    Running,
    WaitingForApproval,
    WaitingForInput,
    Completed,
    Failed,
    TimedOut,
    Aborted,
    Rejected,
}

impl SessionStatus {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Idle => "IDLE",
            Self::Running => "RUNNING",
            Self::WaitingForApproval => "WAITING FOR APPROVAL",
            Self::WaitingForInput => "WAITING FOR INPUT",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
            Self::TimedOut => "TIMED OUT",
            Self::Aborted => "ABORTED",
            Self::Rejected => "REJECTED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionOrigin {
    User,
    Automation,
    Subagent,
    Team,
}

impl SessionOrigin {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Automation => "automation",
            Self::Subagent => "subagent",
            Self::Team => "team",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionLineage {
    pub(crate) root_session_id: String,
    pub(crate) parent_session_id: Option<String>,
    pub(crate) origin: SessionOrigin,
}

// ---------------------------------------------------------------------------
// CompactionState
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompactionState {
    Idle,
    Suggested,
    Running,
    Completed,
    Failed,
}

impl CompactionState {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Idle => "IDLE",
            Self::Suggested => "SUGGESTED",
            Self::Running => "RUNNING",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
        }
    }
}

// ---------------------------------------------------------------------------
// CheckpointDescriptor
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CheckpointDescriptor {
    pub(crate) checkpoint_id: String,
    pub(crate) created_at: String,
    pub(crate) workspace_revision: String,
    pub(crate) changed_files: Vec<String>,
}

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DiagnosticStatus {
    Pass,
    Warning,
    Fail,
}

impl DiagnosticStatus {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Pass => "PASS",
            Self::Warning => "WARNING",
            Self::Fail => "FAIL",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DiagnosticCheck {
    pub(crate) id: String,
    pub(crate) category: String,
    pub(crate) status: DiagnosticStatus,
    pub(crate) message: String,
    pub(crate) remediation_available: bool,
}

pub(crate) fn mock_diagnostics() -> Vec<DiagnosticCheck> {
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

// ---------------------------------------------------------------------------
// MockPanel
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MockPanel {
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
    Memory,
    Browser,
    Undo,
    Doctor,
}
