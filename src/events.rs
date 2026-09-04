use crate::{
    browser_chat::BrowserChatProvider,
    memory::MemoryRecord,
    types::{
        AuthState, CheckpointDescriptor, DiagnosticCheck, ModelDescriptor, ProviderHealth,
        ProviderId, ProviderProjection, RuntimeConnection, RuntimeMode, SessionStatus,
    },
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum LbeEvent {
    WrapperError {
        message: String,
    },
    SessionStarted {
        session_id: String,
    },
    SessionRestored {
        session_id: String,
    },
    SessionListUpdated {
        sessions: Vec<crate::types::SessionSummary>,
    },
    SessionClosed {
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
        execution_id: Option<String>,
    },
    SnapshotUpdated {
        snapshot: crate::types::LbeSnapshot,
    },
    WorkspaceListingReady {
        path: String,
        entries: Vec<crate::types::WorkspaceEntry>,
        evidence_ref: Option<String>,
        receipt_id: Option<String>,
    },
    WorkspaceReadReady {
        path: String,
        content: String,
        content_sha256: String,
        evidence_ref: Option<String>,
        receipt_id: Option<String>,
    },
    WorkspacePatchReady {
        patch: crate::types::WorkspacePatch,
    },
    McpRegistryUpdated {
        schema_version: u64,
        integrations: Vec<crate::types::McpIntegration>,
    },
    BirdEyeQueryReady {
        tool: String,
        payload: serde_json::Value,
        evidence_ref: Option<String>,
        receipt_id: Option<String>,
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
        execution_id: String,
        tool_call_id: String,
        command_id: String,
        command_summary: String,
    },
    CommandStdoutDelta {
        execution_id: String,
        tool_call_id: String,
        command_id: String,
        text: String,
    },
    CommandStderrDelta {
        execution_id: String,
        tool_call_id: String,
        command_id: String,
        text: String,
    },
    CommandCompleted {
        execution_id: String,
        tool_call_id: String,
        command_id: String,
        exit_code: i32,
    },
    CommandFailed {
        execution_id: String,
        tool_call_id: String,
        command_id: String,
        exit_code: Option<i32>,
        message: String,
    },
    CommandDetached {
        execution_id: String,
        tool_call_id: String,
        command_id: String,
    },
    DetachedCommandProgress {
        execution_id: String,
        command_id: String,
        text: String,
    },
    DetachedCommandCompleted {
        execution_id: String,
        command_id: String,
        exit_code: i32,
    },
    DetachedLogAvailable {
        execution_id: String,
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
        execution_id: String,
        retry_source: String,
        retry_target: String,
        retry_count: u32,
        retry_limit: u32,
    },
    RetryLimitReached {
        execution_id: String,
        retry_source: String,
        retry_target: String,
        retry_limit: u32,
    },
    ExecutionInterrupted {
        execution_id: String,
        reason: String,
    },
    ExecutionResumed {
        execution_id: String,
    },
    TimeoutWarning {
        elapsed_seconds: u64,
        timeout_seconds: u64,
    },
    TimedOut {
        execution_id: String,
        timeout_seconds: u64,
    },
    DiagnosticsUpdated {
        checks: Vec<DiagnosticCheck>,
    },
    AssistantTextDelta {
        text: String,
    },
    ConversationalTurnMessage {
        session_id: String,
        turn_id: String,
        event_id: String,
        text: String,
    },
    ConversationalToolReceipt {
        session_id: String,
        turn_id: String,
        event_id: String,
        operation_id: Option<String>,
        tool_id: String,
        status: String,
        receipt_id: Option<String>,
        evidence_ref: Option<String>,
    },
    ConversationalTurnCompleted {
        session_id: String,
        turn_id: String,
        event_id: String,
    },
    ConversationalTurnError {
        session_id: String,
        turn_id: String,
        event_id: String,
        message: String,
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
        execution_id: String,
        tool_call_id: String,
        tool_name: String,
        input_summary: String,
        risk: ToolRisk,
    },
    ToolStarted {
        execution_id: String,
        tool_call_id: String,
    },
    ToolOutputDelta {
        execution_id: String,
        tool_call_id: String,
        text: String,
    },
    ToolCompleted {
        execution_id: String,
        tool_call_id: String,
        evidence_ref: Option<String>,
    },
    ToolFailed {
        execution_id: String,
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
        execution_id: String,
        status: ValidationStatus,
        result: String,
    },
    LbeCompletionAccepted {
        execution_id: String,
        receipt_id: Option<String>,
    },
    ExecutionRejected {
        approval_id: String,
    },
    AuthorizationRequired {
        operation_id: String,
        approval_id: String,
        capability: String,
        rationale: String,
    },
    AuthorizationResolved {
        operation_id: String,
        approval_id: String,
        verdict: String,
        rationale: String,
    },
    SessionMemoryIndexed {
        session_id: String,
        session_hash: String,
    },
    MemoryRecallStarted {
        query: String,
    },
    MemoryRecallResult {
        query: String,
        records: Vec<MemoryRecord>,
    },
    MemoryRecallEmpty {
        query: String,
    },
    MemoryCheckpointCreated {
        checkpoint_id: String,
        memory_count: usize,
    },
    BrowserChatAttached {
        browser_session_id: String,
        provider: BrowserChatProvider,
    },
    BrowserChatDetached {
        browser_session_id: String,
    },
    BrowserMessageReceived {
        browser_message_id: String,
        content: String,
    },
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
    BrowserChatReconnected {
        browser_session_id: String,
    },
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
