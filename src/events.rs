use crate::{
    browser_chat::BrowserChatProvider,
    memory::MemoryRecord,
    requests::LbeError,
    types::{
        AuthState, CheckpointDescriptor, DiagnosticCheck, ModelDescriptor, ModelRef,
        ProviderHealth, ProviderId, ProviderProjection, RuntimeConnection, RuntimeMode,
        SessionStatus,
    },
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LbeEvent {
    SessionStarted { session_id: String },
    SessionRestored { session_id: String },
    RuntimeAttachmentUpdated {
        connection: RuntimeConnection,
        runtime_id: Option<String>,
        runtime_mode: RuntimeMode,
        attached_client_count: usize,
    },
    SessionStatusUpdated { status: SessionStatus },
    SnapshotUpdated { snapshot: crate::types::LbeSnapshot },
    ProviderCatalogDiscovered { providers: Vec<ProviderProjection> },
    ProviderDiscoveryStarted,
    ProviderDiscoveryCompleted { providers: Vec<ProviderId> },
    ProviderValidationStarted { provider_id: ProviderId },
    ProviderValidationCompleted { provider_id: ProviderId },
    ProviderHealthUpdated { provider_id: ProviderId, health: ProviderHealth },
    ProviderAuthStateUpdated { provider_id: ProviderId, auth_state: AuthState },
    ModelCatalogDiscovered { models: Vec<ModelDescriptor> },
    CheckpointCreated { checkpoint: CheckpointDescriptor },
    CheckpointComparisonReady { checkpoint_id: String, changed_files: Vec<String> },
    CheckpointRestoreRequested { checkpoint_id: String },
    CheckpointRestoreBlocked { checkpoint_id: String, reason: String },
    CheckpointRestored { checkpoint_id: String },
    CommandStarted {
        tool_call_id: String,
        command_id: String,
        command_summary: String,
    },
    CommandStdoutDelta { tool_call_id: String, command_id: String, text: String },
    CommandStderrDelta { tool_call_id: String, command_id: String, text: String },
    CommandCompleted { tool_call_id: String, command_id: String, exit_code: i32 },
    CommandFailed {
        tool_call_id: String,
        command_id: String,
        exit_code: Option<i32>,
        message: String,
    },
    CommandDetached { tool_call_id: String, command_id: String },
    DetachedCommandProgress { command_id: String, text: String },
    DetachedCommandCompleted { command_id: String, exit_code: i32 },
    DetachedLogAvailable { command_id: String },
    ContextCompactionSuggested,
    ContextCompactionStarted,
    ContextCompactionCompleted { context_used: usize },
    ContextCompactionFailed { message: String },
    RetryScheduled { retry_count: u32, retry_limit: u32 },
    RetryLimitReached { retry_limit: u32 },
    TimeoutWarning { elapsed_seconds: u64, timeout_seconds: u64 },
    TimedOut { timeout_seconds: u64 },
    DiagnosticsUpdated { checks: Vec<DiagnosticCheck> },
    AssistantTextDelta { text: String },
    ProposalCreated { approval_id: String, proposal: String },
    PlanUpdated { text: String },
    AuditVerdict { verdict: String },
    ToolRequested {
        tool_call_id: String,
        tool_name: String,
        input_summary: String,
        risk: ToolRisk,
    },
    ToolStarted { tool_call_id: String },
    ToolOutputDelta { tool_call_id: String, text: String },
    ToolCompleted { tool_call_id: String, evidence_ref: Option<String> },
    ToolFailed { tool_call_id: String, message: String },
    ExecutionStarted { execution_id: String },
    AgentRequestedCompletion { execution_id: String },
    ExecutionCompleted { execution_id: String, receipt_id: Option<String> },
    ValidationStarted { execution_id: String },
    ValidationCompleted { status: ValidationStatus, result: String },
    LbeCompletionAccepted { execution_id: String, receipt_id: Option<String> },
    ExecutionRejected,
    SessionMemoryIndexed { session_id: String, session_hash: String },
    MemoryRecallStarted { query: String },
    MemoryRecallResult { query: String, records: Vec<MemoryRecord> },
    MemoryRecallEmpty { query: String },
    MemoryCheckpointCreated { checkpoint_id: String, memory_count: usize },
    BrowserChatAttached { browser_session_id: String, provider: BrowserChatProvider },
    BrowserChatDetached { browser_session_id: String },
    BrowserMessageReceived { browser_message_id: String, content: String },
    BrowserToolRequested {
        browser_message_id: String,
        tool_name: String,
        input_summary: String,
    },
    BrowserToolResultDelivered {
        browser_message_id: String,
        tool_call_id: String,
        receipt_id: Option<String>,
        evidence_ref: Option<String>,
    },
    BrowserChatConnectionLost,
    BrowserChatReconnected { browser_session_id: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolRisk {
    ReadOnly,
    Governed,
    Elevated,
}

impl ToolRisk {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::ReadOnly => "READ_ONLY",
            Self::Governed => "GOVERNED",
            Self::Elevated => "ELEVATED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ValidationStatus {
    Passed,
    Failed,
    InsufficientEvidence,
}

impl ValidationStatus {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Passed => "PASSED",
            Self::Failed => "FAILED",
            Self::InsufficientEvidence => "INSUFFICIENT_EVIDENCE",
        }
    }
}