// ---------------------------------------------------------------------------
// Browser chat interaction bridge contract
// ---------------------------------------------------------------------------
//
// Browser chat is a reasoning/conversation surface, not an execution
// authority. Governed tools must cross LBE before execution.

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum BrowserChatProvider {
    ChatGpt,
    Claude,
    Gemini,
    Other(String),
}

impl BrowserChatProvider {
    pub(crate) fn label(&self) -> &str {
        match self {
            Self::ChatGpt => "ChatGPT",
            Self::Claude => "Claude",
            Self::Gemini => "Gemini",
            Self::Other(provider) => provider.as_str(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BrowserChatSession {
    pub(crate) browser_session_id: String,
    pub(crate) lbe_session_id: String,
    pub(crate) provider: BrowserChatProvider,
    pub(crate) conversation_ref: Option<String>,
    pub(crate) attached: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BrowserChatMessage {
    pub(crate) browser_message_id: String,
    pub(crate) lbe_session_id: String,
    pub(crate) lbe_turn_id: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum BrowserChatEvent {
    MessageReceived(BrowserChatMessage),
    ToolRequested {
        browser_message_id: String,
        tool_name: String,
        input_summary: String,
    },
    ConnectionLost,
    Reconnected { browser_session_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BrowserChatError {
    pub(crate) message: String,
}

pub(crate) trait BrowserChatAdapter {
    fn attach(&mut self, session: &BrowserChatSession) -> Result<(), BrowserChatError>;

    fn send_message(&mut self, message: BrowserChatMessage) -> Result<(), BrowserChatError>;

    fn poll_event(&mut self) -> Result<Option<BrowserChatEvent>, BrowserChatError>;

    fn detach(&mut self) -> Result<(), BrowserChatError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BrowserChatProjection {
    pub(crate) provider: Option<BrowserChatProvider>,
    pub(crate) browser_session_id: Option<String>,
    pub(crate) lbe_session_id: Option<String>,
    pub(crate) conversation_ref: Option<String>,
    pub(crate) attached: bool,
    pub(crate) last_browser_message_id: Option<String>,
    pub(crate) last_lbe_turn_id: Option<String>,
    pub(crate) last_receipt_id: Option<String>,
    pub(crate) last_evidence_ref: Option<String>,
    pub(crate) status: String,
}

impl Default for BrowserChatProjection {
    fn default() -> Self {
        Self {
            provider: None,
            browser_session_id: None,
            lbe_session_id: None,
            conversation_ref: None,
            attached: false,
            last_browser_message_id: None,
            last_lbe_turn_id: None,
            last_receipt_id: None,
            last_evidence_ref: None,
            status: "Detached".to_owned(),
        }
    }
}