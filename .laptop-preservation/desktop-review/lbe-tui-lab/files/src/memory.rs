// ---------------------------------------------------------------------------
// Session memory contract
// ---------------------------------------------------------------------------
//
// LOCAL UI MEMORY · NON-CANONICAL · PRE-INTEGRATION
//
// The production authority for durable session memory remains the canonical
// LBE runtime. This module defines the TUI-facing request/event/projection
// contract used by the mock wrapper until a real LBE memory adapter is wired.

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionMemoryRef {
    pub(crate) session_id: String,
    pub(crate) session_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MemoryRecord {
    pub(crate) memory_id: String,
    pub(crate) session_id: String,
    pub(crate) session_hash: String,
    pub(crate) turn_id: Option<String>,
    pub(crate) record_type: MemoryRecordType,
    pub(crate) summary: String,
    pub(crate) content_hash: String,
    pub(crate) evidence_refs: Vec<String>,
    pub(crate) receipt_refs: Vec<String>,
    pub(crate) created_at: String,
    pub(crate) truth: MemoryTruth,
}

impl MemoryRecord {
    pub(crate) fn verified(&self) -> bool {
        self.truth == MemoryTruth::Verified
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MemoryRecordType {
    UserIntent,
    AgentDecision,
    ToolExecution,
    ValidationResult,
    Completion,
    Checkpoint,
    SessionSummary,
}

impl MemoryRecordType {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::UserIntent => "USER_INTENT",
            Self::AgentDecision => "AGENT_DECISION",
            Self::ToolExecution => "TOOL_EXECUTION",
            Self::ValidationResult => "VALIDATION_RESULT",
            Self::Completion => "COMPLETION",
            Self::Checkpoint => "CHECKPOINT",
            Self::SessionSummary => "SESSION_SUMMARY",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MemoryTruth {
    Observed,
    Verified,
    Unverified,
    Stale,
    Contradicted,
    Superseded,
}

impl MemoryTruth {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Observed => "OBSERVED",
            Self::Verified => "VERIFIED",
            Self::Unverified => "UNVERIFIED",
            Self::Stale => "STALE",
            Self::Contradicted => "CONTRADICTED",
            Self::Superseded => "SUPERSEDED",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MemoryEventIdentity {
    pub(crate) session_hash: String,
    pub(crate) turn_id: Option<String>,
    pub(crate) sequence: u64,
    pub(crate) event_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MemoryProjection {
    pub(crate) current_session_hash: Option<String>,
    pub(crate) indexed_sessions: usize,
    pub(crate) indexed_memories: usize,
    pub(crate) last_recall_query: Option<String>,
    pub(crate) recent_records: Vec<MemoryRecord>,
}

impl Default for MemoryProjection {
    fn default() -> Self {
        Self {
            current_session_hash: Some("sha256:mock-session-92d7c3".to_owned()),
            indexed_sessions: 1,
            indexed_memories: 3,
            last_recall_query: None,
            recent_records: Vec::new(),
        }
    }
}

pub(crate) fn mock_memory_records(query: &str) -> Vec<MemoryRecord> {
    let session_id = "sess_mock_7f31".to_owned();
    let session_hash = "sha256:mock-session-92d7c3".to_owned();
    let records = vec![
        MemoryRecord {
            memory_id: "mem_mock_session_summary".to_owned(),
            session_id: session_id.clone(),
            session_hash: session_hash.clone(),
            turn_id: Some("turn_mock_0".to_owned()),
            record_type: MemoryRecordType::SessionSummary,
            summary: "Mock TUI session projects runtime-owned memory without becoming canonical storage.".to_owned(),
            content_hash: "sha256:mock-summary-a812".to_owned(),
            evidence_refs: Vec::new(),
            receipt_refs: Vec::new(),
            created_at: "2026-08-29T00:00:00Z".to_owned(),
            truth: MemoryTruth::Observed,
        },
        MemoryRecord {
            memory_id: "mem_mock_wrapper_boundary".to_owned(),
            session_id: session_id.clone(),
            session_hash: session_hash.clone(),
            turn_id: Some("turn_mock_0".to_owned()),
            record_type: MemoryRecordType::AgentDecision,
            summary: "LbeWrapper remains the integration boundary for runtime and memory recall requests.".to_owned(),
            content_hash: "sha256:mock-decision-b913".to_owned(),
            evidence_refs: Vec::new(),
            receipt_refs: Vec::new(),
            created_at: "2026-08-29T00:00:00Z".to_owned(),
            truth: MemoryTruth::Verified,
        },
        MemoryRecord {
            memory_id: "mem_mock_validation".to_owned(),
            session_id,
            session_hash,
            turn_id: Some("turn_mock_1".to_owned()),
            record_type: MemoryRecordType::ValidationResult,
            summary: "Mock validation receipts can be referenced, but durable verification is runtime-owned.".to_owned(),
            content_hash: "sha256:mock-validation-c024".to_owned(),
            evidence_refs: vec!["evidence_mock_7f31".to_owned()],
            receipt_refs: vec!["rcpt_demo_7f31".to_owned()],
            created_at: "2026-08-29T00:00:00Z".to_owned(),
            truth: MemoryTruth::Verified,
        },
    ];

    let query = query.to_ascii_lowercase();
    if query.is_empty() || query == "recent" {
        return records;
    }
    records
        .into_iter()
        .filter(|record| record.summary.to_ascii_lowercase().contains(&query))
        .collect()
}
