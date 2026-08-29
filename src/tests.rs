use crate::{
    app::App,
    events::{LbeEvent, ValidationStatus},
    requests::UserRequest,
    types::*,
    ui::*,
    wrapper::{LbeWrapper, MockLbeWrapper},
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
