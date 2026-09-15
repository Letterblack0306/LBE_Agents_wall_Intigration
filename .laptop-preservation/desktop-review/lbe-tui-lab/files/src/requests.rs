use crate::{
    browser_chat::BrowserChatProvider,
    types::{AgentMode, ModelRef, ProviderId},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum UserRequest {
    SubmitTask {
        intent: String,
        mode: AgentMode,
    },
    StartSession,
    ListSessions,
    ResumeSession {
        session_id: String,
    },
    CloseSession {
        session_id: String,
    },
    Continue {
        session_id: String,
        message: String,
    },
    RefreshRuntimeSnapshot,
    RefreshMcpRegistry,
    QueryBirdEye {
        tool: String,
        arguments: serde_json::Value,
    },
    InspectWorkspace {
        path: String,
    },
    ListWorkspace {
        path: String,
    },
    GlobWorkspace {
        pattern: String,
    },
    SearchWorkspace {
        query: String,
    },
    PatchWorkspace {
        path: String,
        content: String,
        expected_sha256: String,
    },
    RunRegisteredProcess {
        command_id: String,
    },
    RequestAuthorization {
        capability: String,
    },
    RefreshProviderCatalog,
    ConfigureProvider {
        provider_id: ProviderId,
        base_url: Option<String>,
        credential_ref: Option<String>,
    },
    ValidateProvider {
        provider_id: ProviderId,
    },
    RemoveProvider {
        provider_id: ProviderId,
    },
    SelectModel {
        model: ModelRef,
    },
    CompareCheckpoint {
        checkpoint_id: String,
    },
    RestoreCheckpoint {
        checkpoint_id: String,
    },
    CompactContext,
    RunDiagnostics,
    Approve {
        approval_id: String,
    },
    Reject {
        approval_id: String,
    },
    SetMode {
        mode: AgentMode,
    },
    RecallSessionMemory {
        query: String,
        limit: usize,
    },
    RecallSession {
        session_id: String,
    },
    CreateMemoryCheckpoint,
    ForgetSessionMemory {
        session_id: String,
    },
    AttachBrowserChat {
        provider: BrowserChatProvider,
        conversation_ref: Option<String>,
    },
    DetachBrowserChat,
    SendBrowserMessage {
        content: String,
    },
    ContinueBrowserSession {
        browser_session_id: String,
        message: String,
    },
    Abort,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LbeError {
    pub(crate) message: String,
}

impl LbeError {
    pub(crate) fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}
