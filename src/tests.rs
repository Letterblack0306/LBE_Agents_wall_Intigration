use crate::{
    app::App,
    events::{LbeEvent, ValidationStatus},
    requests::UserRequest,
    types::*,
    ui::*,
    wrapper::{LbeWrapper, MockLbeWrapper, RealLbeWrapper, validate_provenance},
};

use ratatui::termina::event::KeyCode;
use ratatui::{Terminal, backend::TestBackend};
use std::time::{Duration, Instant};

fn start_mock_execution(wrapper: &mut MockLbeWrapper, now: Instant) {
    wrapper
        .submit(
            UserRequest::SubmitTask {
                intent: "inspect workspace".to_owned(),
                mode: AgentMode::Regular,
            },
            now,
        )
        .unwrap();
    while wrapper.poll_event(now).unwrap().is_some() {}
    wrapper
        .submit(
            UserRequest::Approve {
                approval_id: "apr_mock_7f31".to_owned(),
            },
            now,
        )
        .unwrap();
    while wrapper.poll_event(now).unwrap().is_some() {}
}

fn active_execution_id(wrapper: &MockLbeWrapper) -> String {
    wrapper
        .snapshot()
        .active_execution_id
        .expect("mock execution must have an active execution ID")
}

fn drain_wrapper(wrapper: &mut MockLbeWrapper, now: Instant) -> Vec<LbeEvent> {
    let mut events = Vec::new();
    while let Some(event) = wrapper.poll_event(now).unwrap() {
        events.push(event);
    }
    events
}

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
    assert_eq!(app.snapshot.session_state, SessionStatus::Completed);
    assert_eq!(
        app.snapshot.execution_status,
        Some(ExecutionStatus::Completed)
    );
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
            .any(|line| line.contains("COMPLETION ACCEPTED"))
    );
}

#[test]
fn success_terminal_exactly_once_and_snapshot_matches_execution_terminal() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);

    let events = drain_wrapper(&mut wrapper, now + Duration::from_millis(950));
    let completion_count = events
        .iter()
        .filter(|event| matches!(event, LbeEvent::LbeCompletionAccepted { .. }))
        .count();

    assert_eq!(completion_count, 1);
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Completed);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Completed)
    );
}

#[test]
fn duplicate_terminal_event_after_completion_is_suppressed() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    let mut app = App::with_snapshot(wrapper.snapshot());
    start_mock_execution(&mut wrapper, now);

    for event in drain_wrapper(&mut wrapper, now + Duration::from_millis(950)) {
        app.reduce_lbe_event(event);
    }
    let terminal_lines = app
        .transcript
        .iter()
        .filter(|line| line.contains("COMPLETION ACCEPTED"))
        .count();
    assert_eq!(terminal_lines, 1);

    wrapper.inject_due_event_for_test(
        LbeEvent::LbeCompletionAccepted {
            execution_id: active_execution_id(&wrapper),
            receipt_id: Some("duplicate".to_owned()),
        },
        now,
    );

    assert!(wrapper.poll_event(now).unwrap().is_none());
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Completed);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Completed)
    );
    assert_eq!(
        app.transcript
            .iter()
            .filter(|line| line.contains("COMPLETION ACCEPTED"))
            .count(),
        terminal_lines
    );
}

#[test]
fn duplicate_rejected_terminal_is_suppressed() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    wrapper
        .submit(
            UserRequest::SubmitTask {
                intent: "inspect workspace".to_owned(),
                mode: AgentMode::Regular,
            },
            now,
        )
        .unwrap();
    while wrapper.poll_event(now).unwrap().is_some() {}
    wrapper
        .submit(
            UserRequest::Reject {
                approval_id: "apr_mock_7f31".to_owned(),
            },
            now,
        )
        .unwrap();
    let first_terminal_events =
        drain_wrapper(&mut wrapper, Instant::now() + Duration::from_millis(1));
    assert_eq!(
        first_terminal_events
            .iter()
            .filter(|event| matches!(event, LbeEvent::ExecutionRejected))
            .count(),
        1
    );

    wrapper.inject_due_event_for_test(LbeEvent::ExecutionRejected, now);

    assert!(wrapper.poll_event(now).unwrap().is_none());
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Rejected);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Rejected)
    );
}

#[test]
fn duplicate_timeout_terminal_is_suppressed() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    wrapper.set_timeout_seconds_for_test(0);
    start_mock_execution(&mut wrapper, now);
    let first_terminal_events = drain_wrapper(&mut wrapper, now + Duration::from_secs(1));
    assert_eq!(
        first_terminal_events
            .iter()
            .filter(|event| matches!(event, LbeEvent::TimedOut { .. }))
            .count(),
        1
    );

    wrapper.inject_due_event_for_test(LbeEvent::TimedOut { timeout_seconds: 0 }, now);

    assert!(wrapper.poll_event(now).unwrap().is_none());
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::TimedOut);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::TimedOut)
    );
}

#[test]
fn duplicate_failed_terminal_is_suppressed() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);
    wrapper.inject_due_event_for_test(
        LbeEvent::ValidationCompleted {
            status: ValidationStatus::Passed,
            result: "invalid early validation".to_owned(),
        },
        now,
    );
    let first_failure = wrapper.poll_event(now).unwrap().unwrap();
    assert!(matches!(first_failure, LbeEvent::ToolFailed { .. }));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Failed);

    wrapper.inject_due_event_for_test(
        LbeEvent::ValidationCompleted {
            status: ValidationStatus::Failed,
            result: "duplicate failure".to_owned(),
        },
        now,
    );

    assert!(wrapper.poll_event(now).unwrap().is_none());
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Failed);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Failed)
    );
}

#[test]
fn duplicate_aborted_terminal_is_suppressed() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);
    wrapper.submit(UserRequest::Abort, now).unwrap();
    let first_terminal_events =
        drain_wrapper(&mut wrapper, Instant::now() + Duration::from_millis(1));
    assert_eq!(
        first_terminal_events
            .iter()
            .filter(|event| matches!(event, LbeEvent::ExecutionRejected))
            .count(),
        1
    );

    wrapper.inject_due_event_for_test(LbeEvent::ExecutionRejected, now);

    assert!(wrapper.poll_event(now).unwrap().is_none());
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Aborted);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Aborted)
    );
}

#[test]
fn duplicate_completion_and_post_terminal_events_do_not_mutate_state_twice() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);
    let _ = drain_wrapper(&mut wrapper, now + Duration::from_millis(950));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Completed);

    wrapper.inject_due_event_for_test(
        LbeEvent::LbeCompletionAccepted {
            execution_id: active_execution_id(&wrapper),
            receipt_id: Some("duplicate".to_owned()),
        },
        now,
    );
    wrapper.inject_due_event_for_test(
        LbeEvent::ToolStarted {
            tool_call_id: "tool_mock_workspace".to_owned(),
        },
        now,
    );

    let events = drain_wrapper(&mut wrapper, now);
    assert!(events.iter().all(|event| {
        !matches!(
            event,
            LbeEvent::LbeCompletionAccepted { .. } | LbeEvent::ToolStarted { .. }
        )
    }));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Completed);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Completed)
    );
}

#[test]
fn ordering_guards_reject_missing_intermediate_states() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);

    wrapper.inject_due_event_for_test(
        LbeEvent::ToolCompleted {
            tool_call_id: "unknown_tool".to_owned(),
            evidence_ref: None,
        },
        now,
    );

    let event = wrapper.poll_event(now).unwrap().unwrap();
    assert!(matches!(
        event,
        LbeEvent::ToolFailed { message, .. } if message.contains("unknown tool-call ID")
    ));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Failed);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::Failed)
    );
}

#[test]
fn validation_completion_before_validation_start_is_rejected() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);

    wrapper.inject_due_event_for_test(
        LbeEvent::ValidationCompleted {
            status: ValidationStatus::Passed,
            result: "invalid early validation".to_owned(),
        },
        now,
    );

    let event = wrapper.poll_event(now).unwrap().unwrap();
    assert!(matches!(
        event,
        LbeEvent::ToolFailed { message, .. }
            if message.contains("validation completion requires validation start")
    ));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Failed);
}

#[test]
fn completion_before_validation_is_rejected() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    start_mock_execution(&mut wrapper, now);

    wrapper.inject_due_event_for_test(
        LbeEvent::LbeCompletionAccepted {
            execution_id: active_execution_id(&wrapper),
            receipt_id: None,
        },
        now,
    );

    let event = wrapper.poll_event(now).unwrap().unwrap();
    assert!(matches!(
        event,
        LbeEvent::ToolFailed { message, .. }
            if message.contains("completion acceptance requires passed validation")
    ));
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::Failed);
}

#[test]
fn timeout_terminalizes_once_and_clears_pending_work() {
    let now = Instant::now();
    let mut wrapper = MockLbeWrapper::default();
    wrapper.set_timeout_seconds_for_test(0);
    start_mock_execution(&mut wrapper, now);

    let events = drain_wrapper(&mut wrapper, now + Duration::from_secs(1));
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, LbeEvent::TimedOut { .. }))
            .count(),
        1
    );
    assert_eq!(wrapper.snapshot().session_state, SessionStatus::TimedOut);
    assert_eq!(
        wrapper.snapshot().execution_status,
        Some(ExecutionStatus::TimedOut)
    );
    assert!(wrapper.next_wake(now).is_none());
}

#[test]
fn abort_and_reject_terminalize_once() {
    let now = Instant::now();
    let mut rejected = MockLbeWrapper::default();
    rejected
        .submit(
            UserRequest::SubmitTask {
                intent: "inspect workspace".to_owned(),
                mode: AgentMode::Regular,
            },
            now,
        )
        .unwrap();
    while rejected.poll_event(now).unwrap().is_some() {}
    rejected
        .submit(
            UserRequest::Reject {
                approval_id: "apr_mock_7f31".to_owned(),
            },
            now,
        )
        .unwrap();
    let reject_events = drain_wrapper(&mut rejected, Instant::now() + Duration::from_millis(1));
    assert_eq!(
        reject_events
            .iter()
            .filter(|event| matches!(event, LbeEvent::ExecutionRejected))
            .count(),
        1
    );
    assert_eq!(rejected.snapshot().session_state, SessionStatus::Rejected);

    let mut aborted = MockLbeWrapper::default();
    start_mock_execution(&mut aborted, now);
    aborted.submit(UserRequest::Abort, now).unwrap();
    let abort_events = drain_wrapper(&mut aborted, Instant::now() + Duration::from_millis(1));
    assert_eq!(
        abort_events
            .iter()
            .filter(|event| matches!(event, LbeEvent::ExecutionRejected))
            .count(),
        1
    );
    assert_eq!(aborted.snapshot().session_state, SessionStatus::Aborted);
}

#[test]
fn parallel_wrapper_execution_ids_do_not_collide() {
    let now = Instant::now();
    let mut first = MockLbeWrapper::default();
    let mut second = MockLbeWrapper::default();
    start_mock_execution(&mut first, now);
    start_mock_execution(&mut second, now);

    assert_ne!(
        first.snapshot().active_execution_id,
        second.snapshot().active_execution_id
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
            .snapshot()
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
            .any(|line| line.contains("COMMAND  completed") && line.contains("exit 0"))
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

#[test]
fn real_wrapper_starts_disconnected_without_endpoint() {
    let wrapper = RealLbeWrapper::new();
    assert_eq!(wrapper.connection_state(), RuntimeConnection::Disconnected);

    let snapshot = wrapper.snapshot();
    assert_eq!(snapshot.connection, RuntimeConnection::Disconnected);
    assert_eq!(snapshot.runtime_mode, RuntimeMode::Local);
    assert_eq!(snapshot.runtime_id, None);
    assert_eq!(snapshot.session_id, None);
    assert_eq!(snapshot.session_state, SessionStatus::Idle);
    assert_eq!(snapshot.execution_status, None);
    assert!(snapshot.providers.is_empty());
    assert!(snapshot.models.is_empty());
}

#[test]
fn real_wrapper_submit_is_rejected_when_disconnected() {
    let mut wrapper = RealLbeWrapper::new();
    let result = wrapper.submit(
        UserRequest::SubmitTask {
            intent: "inspect workspace".to_owned(),
            mode: AgentMode::Regular,
        },
        Instant::now(),
    );
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("operation requires a connected LBE runtime")
    );
}

#[test]
fn real_wrapper_attach_requires_explicit_configuration() {
    let mut wrapper = RealLbeWrapper::new();
    let result = wrapper.attach();
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("LBE_WALL_ROOT is not configured")
    );
}

#[test]
fn real_wrapper_attaches_configured_project_truth_without_mock_state() {
    let mut wrapper = RealLbeWrapper::new();
    if std::env::var_os("LBE_WALL_ROOT").is_none()
        || std::env::var_os("LBE_TARGET_WORKSPACE").is_none()
    {
        assert_eq!(wrapper.connection_state(), RuntimeConnection::Disconnected);
        return;
    }

    wrapper
        .attach()
        .expect("configured Agent Wall must export project_truth");
    let snapshot = wrapper.snapshot();
    let projection = snapshot
        .project_truth
        .as_ref()
        .expect("real attachment must retain project_truth");
    assert_eq!(snapshot.connection, RuntimeConnection::Connected);
    assert_eq!(snapshot.runtime_mode, RuntimeMode::Local);
    assert_eq!(snapshot.runtime_id, None);
    assert_eq!(snapshot.session_id, None);
    assert_eq!(snapshot.turn_id, None);
    assert_eq!(
        snapshot.workspace_id.as_deref(),
        Some(projection.workspace_id.as_str())
    );
    assert_eq!(snapshot.workspace_label, projection.data.workspace_root);
    assert!(matches!(
        wrapper.poll_event(Instant::now()).unwrap(),
        Some(LbeEvent::RuntimeAttachmentUpdated {
            connection: RuntimeConnection::Connected,
            runtime_id: None,
            runtime_mode: RuntimeMode::Local,
            ..
        })
    ));
    assert!(
        matches!(wrapper.poll_event(Instant::now()).unwrap(), Some(LbeEvent::SnapshotUpdated { snapshot: event_snapshot }) if event_snapshot.project_truth.is_some())
    );
}

#[test]
fn real_wrapper_poll_returns_none_when_disconnected() {
    let mut wrapper = RealLbeWrapper::new();
    assert!(wrapper.poll_event(Instant::now()).unwrap().is_none());
}

#[test]
fn real_wrapper_next_wake_is_none_when_disconnected() {
    let wrapper = RealLbeWrapper::new();
    assert!(wrapper.next_wake(Instant::now()).is_none());
}

// ---------------------------------------------------------------------------
// REAL_AGENT_WALL_SESSION_CONTEXT_ATTACHMENT_V1 tests
// ---------------------------------------------------------------------------

use crate::wrapper::validate_session_context;

fn build_minimal_session_context(
    workspace_id: &str,
    session_id: &str,
    canonical_root: &str,
) -> String {
    format!(
        r#"{{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "{ws}",
  "session_id": "{sid}",
  "read_only": true,
  "data": {{
    "session": {{
      "session_id": "{sid}",
      "project_workspace_id": "{ws}",
      "canonical_workspace_root": "{cr}",
      "mode": "interactive",
      "permission": null,
      "runtime_policy": null,
      "provider_id": null,
      "provider_model": null,
      "active_profile_id": null,
      "permission_policy_id": null,
      "evidence_policy_id": null,
      "checkpoint_id": null,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }},
    "workspace": {{
      "project_workspace_id": "{ws}",
      "canonical_root": "{cr}",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    }},
    "task": null,
    "checkpoint": null,
    "checkpoint_revalidation": null,
    "verified_facts": [],
    "active_constraints": [],
    "recent_failures": [],
    "transcript": []
  }}
}}"#,
        ws = workspace_id,
        sid = session_id,
        cr = canonical_root,
    )
}

#[test]
fn validate_session_context_accepts_minimal_valid_projection() {
    let sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:/fake/root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:/fake/root", "sess_xyz");
    assert!(
        result.is_ok(),
        "expected minimal projection to validate: {:?}",
        result
    );
}

#[test]
fn validate_session_context_rejects_wrong_projection_type() {
    let mut sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    sc_json = sc_json.replace("\"session_context\"", "\"other_type\"");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("projection_type"));
}

#[test]
fn validate_session_context_rejects_wrong_schema_version() {
    let mut sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    sc_json = sc_json.replace("\"1.0\"", "\"2.0\"");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("schema_version"));
}

#[test]
fn validate_session_context_rejects_read_only_false() {
    let mut sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    sc_json = sc_json.replace("\"read_only\": true", "\"read_only\": false");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("read-only"));
}

#[test]
fn validate_session_context_rejects_empty_workspace_id() {
    let sc_json = build_minimal_session_context("", "sess_xyz", "C:\\fake\\root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
}

#[test]
fn validate_session_context_rejects_empty_session_id() {
    let sc_json = build_minimal_session_context("ws_abc", "", "C:\\fake\\root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "");
    assert!(result.is_err());
}

#[test]
fn validate_session_context_rejects_session_project_workspace_id_mismatch() {
    let sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_OTHER", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    let msg = result.unwrap_err().message;
    assert!(
        msg.contains("workspace_id") && msg.contains("authoritative"),
        "expected workspace_id mismatch, got: {msg}"
    );
}

#[test]
fn validate_session_context_rejects_workspace_project_workspace_id_mismatch() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_OTHER",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("data.workspace.project_workspace_id")
    );
}

#[test]
fn validate_session_context_rejects_canonical_root_mismatch() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\other\\path",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("canonical_workspace_root")
    );
}

#[test]
fn validate_session_context_rejects_top_level_session_id_mismatch() {
    let sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_OTHER");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("LBE_SESSION_ID"));
}

#[test]
fn validate_session_context_rejects_session_session_id_mismatch() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_OTHER",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    let msg = result.unwrap_err().message;
    assert!(msg.contains("data.session.session_id"), "got: {msg}");
}

#[test]
fn validate_session_context_rejects_malformed_opaque_wrapper() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "task": {
      "owner_payload_version": "1.0",
      "opaque": false,
      "payload": null
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("opaque"));
}

#[test]
fn validate_session_context_rejects_malformed_opaque_version() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "checkpoint": {
      "owner_payload_version": "2.0",
      "opaque": true,
      "payload": null
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("owner_payload_version")
    );
}

#[test]
fn validate_session_context_rejects_malformed_transcript_kind() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": [
      { "sequence": 0, "kind": "", "status": "ok", "text": "hello", "event_id": "evt_1" }
    ]
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("transcript[0].kind"));
}

#[test]
fn validate_session_context_rejects_malformed_transcript_status() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": [
      { "sequence": 0, "kind": "user", "status": "", "text": "hello", "event_id": "evt_1" }
    ]
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(result.unwrap_err().message.contains("transcript[0].status"));
}

#[test]
fn validate_session_context_rejects_malformed_transcript_event_id() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": [
      { "sequence": 0, "kind": "user", "status": "ok", "text": "hello", "event_id": "" }
    ]
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    let result = validate_session_context(&projection, "ws_abc", "C:\\fake\\root", "sess_xyz");
    assert!(result.is_err());
    assert!(
        result
            .unwrap_err()
            .message
            .contains("transcript[0].event_id")
    );
}

#[test]
fn real_wrapper_initial_state_has_no_session_context() {
    let wrapper = RealLbeWrapper::new();
    let snapshot = wrapper.snapshot();
    assert!(
        snapshot.session_context.is_none(),
        "RealLbeWrapper::new() must not fabricate session_context"
    );
}

#[test]
fn real_wrapper_default_snapshot_has_no_session_context() {
    let snapshot = LbeSnapshot::default();
    assert!(
        snapshot.session_context.is_none(),
        "Default snapshot must not have session_context populated"
    );
}

#[test]
fn real_wrapper_does_not_populate_provider_runtime_state() {
    let wrapper = RealLbeWrapper::new();
    let snap = wrapper.snapshot();
    assert!(
        snap.providers.is_empty(),
        "real wrapper must not populate providers"
    );
    assert!(
        snap.models.is_empty(),
        "real wrapper must not populate models"
    );
    assert!(
        snap.selected_model.is_none(),
        "real wrapper must not populate selected_model"
    );
    assert_eq!(snap.model_id, "");
    assert_eq!(snap.model_family, "");
}

#[test]
fn real_wrapper_does_not_fabricate_lineage_or_checkpoint_or_memory() {
    let wrapper = RealLbeWrapper::new();
    let snap = wrapper.snapshot();
    assert!(
        snap.latest_checkpoint.is_none(),
        "real wrapper must not fabricate CheckpointDescriptor"
    );
    // session_context must never populate SessionLineage or MemoryProjection
    // (these are TUI-owned mocks; the real wrapper does not call them).
    let _ = snap;
}

#[test]
fn real_wrapper_attach_fails_closed_without_lbe_wall_database() {
    let wall_root = std::env::var_os("LBE_WALL_ROOT");
    let target = std::env::var_os("LBE_TARGET_WORKSPACE");
    let database = std::env::var_os("LBE_WALL_DATABASE");
    let session_id = std::env::var_os("LBE_SESSION_ID");
    if wall_root.is_none() || target.is_none() || database.is_some() || session_id.is_none() {
        return;
    }
    let mut wrapper = RealLbeWrapper::new();
    let result = wrapper.attach();
    assert!(result.is_err());
    let msg = result.unwrap_err().message;
    assert!(
        msg.contains("LBE_WALL_DATABASE"),
        "expected LBE_WALL_DATABASE error, got: {msg}"
    );
    assert_eq!(wrapper.connection_state(), RuntimeConnection::Disconnected);
    assert!(wrapper.snapshot().session_context.is_none());
    assert!(wrapper.snapshot().project_truth.is_none());
}

#[test]
fn real_wrapper_attach_fails_closed_without_lbe_session_id() {
    let wall_root = std::env::var_os("LBE_WALL_ROOT");
    let target = std::env::var_os("LBE_TARGET_WORKSPACE");
    let database = std::env::var_os("LBE_WALL_DATABASE");
    let session_id = std::env::var_os("LBE_SESSION_ID");
    if wall_root.is_none() || target.is_none() || database.is_none() || session_id.is_some() {
        return;
    }
    let mut wrapper = RealLbeWrapper::new();
    let result = wrapper.attach();
    assert!(result.is_err());
    let msg = result.unwrap_err().message;
    assert!(
        msg.contains("LBE_SESSION_ID"),
        "expected LBE_SESSION_ID error, got: {msg}"
    );
    assert_eq!(wrapper.connection_state(), RuntimeConnection::Disconnected);
    assert!(wrapper.snapshot().session_context.is_none());
    assert!(wrapper.snapshot().project_truth.is_none());
}

#[test]
fn real_wrapper_attach_retains_session_context_when_both_projections_succeed() {
    let wall_root = std::env::var_os("LBE_WALL_ROOT");
    let target = std::env::var_os("LBE_TARGET_WORKSPACE");
    let database = std::env::var_os("LBE_WALL_DATABASE");
    let session_id = std::env::var_os("LBE_SESSION_ID");
    if wall_root.is_none() || target.is_none() || database.is_none() || session_id.is_none() {
        return;
    }
    let mut wrapper = RealLbeWrapper::new();
    if wrapper.attach().is_err() {
        return;
    }
    let snapshot = wrapper.snapshot();
    assert_eq!(snapshot.connection, RuntimeConnection::Connected);
    assert!(snapshot.project_truth.is_some());
    assert!(
        snapshot.session_context.is_some(),
        "real attachment must retain session_context"
    );
    assert_eq!(
        snapshot.session_id,
        snapshot
            .session_context
            .as_ref()
            .map(|sc| sc.session_id.clone())
    );
    assert_eq!(
        snapshot.workspace_id,
        snapshot
            .project_truth
            .as_ref()
            .map(|pt| pt.workspace_id.clone())
    );
    assert_eq!(snapshot.runtime_id, None);
    assert_eq!(snapshot.turn_id, None);
    assert!(snapshot.latest_checkpoint.is_none());
}

#[test]
fn session_context_schema_deserializes_with_required_fields() {
    let sc_json = build_minimal_session_context("ws_abc", "sess_xyz", "C:\\fake\\root");
    let projection: SessionContextProjection = serde_json::from_str(&sc_json).unwrap();
    assert_eq!(projection.schema_version, "1.0");
    assert_eq!(projection.projection_type, "session_context");
    assert!(projection.read_only);
    assert_eq!(projection.workspace_id, "ws_abc");
    assert_eq!(projection.session_id, "sess_xyz");
    assert_eq!(projection.data.session.session_id, "sess_xyz");
    assert_eq!(projection.data.workspace.project_workspace_id, "ws_abc");
    assert_eq!(projection.data.session.provider_id, None);
    assert_eq!(projection.data.session.provider_model, None);
}

#[test]
fn session_context_projection_round_trips_provider_fields() {
    let sc_json = r#"{
  "schema_version": "1.0",
  "projection_type": "session_context",
  "generated_at": "2026-01-01T00:00:00Z",
  "workspace_id": "ws_abc",
  "session_id": "sess_xyz",
  "read_only": true,
  "data": {
    "session": {
      "session_id": "sess_xyz",
      "project_workspace_id": "ws_abc",
      "canonical_workspace_root": "C:\\fake\\root",
      "mode": "interactive",
      "provider_id": "openai",
      "provider_model": "gpt-5",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    },
    "workspace": {
      "project_workspace_id": "ws_abc",
      "canonical_root": "C:\\fake\\root",
      "branch": "main",
      "head": "deadbeef",
      "status_short": []
    },
    "transcript": []
  }
}"#;
    let projection: SessionContextProjection = serde_json::from_str(sc_json).unwrap();
    assert_eq!(
        projection.data.session.provider_id.as_deref(),
        Some("openai")
    );
    assert_eq!(
        projection.data.session.provider_model.as_deref(),
        Some("gpt-5")
    );
    // Provider fields are inside session_context only; they do NOT populate snapshot providers/models.
    let wrapper = RealLbeWrapper::new();
    let snap = wrapper.snapshot();
    assert!(snap.providers.is_empty());
    assert_eq!(snap.model_id, "");
}

fn valid_provenance() -> ProvenanceProjection {
    ProvenanceProjection {
        schema_version: "1.0".to_owned(),
        projection_type: "provenance".to_owned(),
        generated_at: "2026-01-01T00:00:00Z".to_owned(),
        workspace_id: "ws_abc".to_owned(),
        session_id: Some("sess_xyz".to_owned()),
        read_only: true,
        data: ProvenanceData {
            session_id: Some("sess_xyz".to_owned()),
            task_id: None,
            sources: vec![OpaqueOwnerPayload {
                owner_payload_version: "1.0".to_owned(),
                opaque: true,
                payload: serde_json::json!({"owned": true}),
            }],
            events: vec![ProvenanceEvent {
                event_id: "evt_1".to_owned(),
                sequence: 0,
                event_type: "turn_started".to_owned(),
                turn_id: "turn_1".to_owned(),
                item_id: None,
                provider_id: Some("provider".to_owned()),
                model_id: Some("model".to_owned()),
                provider_request_id: None,
                provider_item_id: None,
                provider_tool_call_id: None,
                lbe_call_id: None,
                runtime_operation_id: Some("runtime-op".to_owned()),
                tool_receipt_id: Some("receipt".to_owned()),
            }],
            evidence_ids: None,
            staleness: ProvenanceStaleness::Current,
        },
    }
}

#[test]
fn provenance_validation_accepts_current_stale_and_unknown() {
    for staleness in [
        ProvenanceStaleness::Current,
        ProvenanceStaleness::Stale,
        ProvenanceStaleness::Unknown,
    ] {
        let mut projection = valid_provenance();
        projection.data.staleness = staleness;
        assert!(validate_provenance(&projection, "ws_abc", "sess_xyz").is_ok());
    }
}

#[test]
fn provenance_validation_rejects_identity_and_structure_mismatches() {
    macro_rules! assert_rejected {
        ($name:literal, $mutate:expr) => {{
            let mut projection = valid_provenance();
            $mutate(&mut projection);
            assert!(
                validate_provenance(&projection, "ws_abc", "sess_xyz").is_err(),
                "case {} must fail closed",
                $name
            );
        }};
    }
    assert_rejected!("workspace", |p: &mut ProvenanceProjection| p
        .workspace_id
        .clear());
    assert_rejected!("workspace mismatch", |p: &mut ProvenanceProjection| {
        p.workspace_id = "other".to_owned()
    });
    assert_rejected!("top session mismatch", |p: &mut ProvenanceProjection| {
        p.session_id = Some("other".to_owned())
    });
    assert_rejected!("data session mismatch", |p: &mut ProvenanceProjection| {
        p.data.session_id = Some("other".to_owned())
    });
    assert_rejected!("schema", |p: &mut ProvenanceProjection| {
        p.schema_version = "2.0".to_owned()
    });
    assert_rejected!("projection type", |p: &mut ProvenanceProjection| {
        p.projection_type = "other".to_owned()
    });
    assert_rejected!("read only", |p: &mut ProvenanceProjection| {
        p.read_only = false
    });
    assert_rejected!("source version", |p: &mut ProvenanceProjection| {
        p.data.sources[0].owner_payload_version = "2.0".to_owned()
    });
    assert_rejected!("source opaque", |p: &mut ProvenanceProjection| {
        p.data.sources[0].opaque = false
    });
}

#[test]
fn provenance_validation_rejects_malformed_events_and_deserialization_rejects_unknown_staleness() {
    for mutate in [
        |p: &mut ProvenanceProjection| p.data.events[0].event_id.clear(),
        |p: &mut ProvenanceProjection| p.data.events[0].event_type.clear(),
        |p: &mut ProvenanceProjection| p.data.events[0].turn_id.clear(),
    ] {
        let mut projection = valid_provenance();
        mutate(&mut projection);
        assert!(validate_provenance(&projection, "ws_abc", "sess_xyz").is_err());
    }
    let json = r#"{
      "schema_version":"1.0","projection_type":"provenance","generated_at":"now",
      "workspace_id":"ws_abc","session_id":"sess_xyz","read_only":true,
      "data":{"session_id":"sess_xyz","task_id":null,"sources":[],"events":[],
      "evidence_ids":null,"staleness":"invalid"}
    }"#;
    assert!(serde_json::from_str::<ProvenanceProjection>(json).is_err());
}

#[test]
fn provenance_is_not_present_in_initial_or_unconnected_real_snapshot() {
    let wrapper = RealLbeWrapper::new();
    let snapshot = wrapper.snapshot();
    assert!(snapshot.provenance.is_none());
    assert!(snapshot.latest_checkpoint.is_none());
    assert_eq!(snapshot.runtime_id, None);
    assert_eq!(snapshot.turn_id, None);
}
