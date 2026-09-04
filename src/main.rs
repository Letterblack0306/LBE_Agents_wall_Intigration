mod app;
mod browser_chat;
mod events;
mod memory;
mod requests;
mod types;
mod ui;
mod wrapper;

#[cfg(test)]
mod tests;

use std::{
    io,
    io::Read,
    time::{Duration, Instant},
};

use ratatui::termina::{EventReader, event::Event};

use app::App;
use events::LbeEvent;
use types::{AgentMode, Phase};
use wrapper::{LbeWrapper, WrapperClient};

#[derive(Debug, Clone, Default)]
struct CliOptions {
    project: Option<String>,
    prompt: Option<String>,
    model: Option<types::ModelRef>,
    mode: Option<AgentMode>,
    session_id: Option<String>,
    continue_session: bool,
    json: bool,
}

fn main() -> io::Result<()> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if arguments
        .iter()
        .any(|argument| argument == "--help" || argument == "-h")
    {
        print_help();
        return Ok(());
    }
    if arguments
        .iter()
        .any(|argument| argument == "--version" || argument == "-V")
    {
        println!("lbe {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    let (command, options) = parse_cli(&arguments)?;
    if command == Some("run") || command == Some("--no-tui") {
        let exit_code = run_headless(options)?;
        if exit_code != 0 {
            std::process::exit(exit_code);
        }
        return Ok(());
    }
    if let Some(project) = options.project.as_deref() {
        std::env::set_current_dir(project).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("cannot use project path '{project}': {error}"),
            )
        })?;
    }
    let (mut terminal, events) = ui::init_terminal()?;

    let result = run(&mut terminal, &events, options);
    let restore_result = ui::restore_terminal(&mut terminal);

    match result {
        Err(error) => Err(error),
        Ok(()) => restore_result,
    }
}

fn parse_cli(arguments: &[String]) -> io::Result<(Option<&str>, CliOptions)> {
    let mut options = CliOptions::default();
    let mut command = None;
    let mut prompt_parts = Vec::new();
    let mut index = 0;
    while index < arguments.len() {
        let argument = arguments[index].as_str();
        match argument {
            "run" | "--no-tui" if command.is_none() => command = Some(argument),
            "--json" => options.json = true,
            "--continue" | "-c" => options.continue_session = true,
            "--auto" => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "--auto is not supported: LBE authorization cannot be bypassed",
                ));
            }
            "--port" => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "--port is not supported: lbe uses its local governed runtime transport",
                ));
            }
            "--fork" => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "--fork is not supported by the current LBE session contract",
                ));
            }
            "--prompt" => {
                index += 1;
                options.prompt = Some(required_value(arguments, index, "--prompt")?);
            }
            "--model" | "-m" => {
                index += 1;
                let value = required_value(arguments, index, argument)?;
                options.model = Some(parse_model(&value)?);
            }
            "--agent" => {
                index += 1;
                let value = required_value(arguments, index, "--agent")?;
                options.mode = Some(parse_agent(&value)?);
            }
            "--session" | "-s" => {
                index += 1;
                options.session_id = Some(required_value(arguments, index, argument)?);
            }
            value if value.starts_with('-') => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("unknown option '{value}'; use --help for usage"),
                ));
            }
            value if command == Some("run") || command == Some("--no-tui") => {
                prompt_parts.push(value.to_owned())
            }
            value if options.project.is_none() => options.project = Some(value.to_owned()),
            value => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("unexpected argument '{value}'; use --help for usage"),
                ));
            }
        }
        index += 1;
    }
    if !prompt_parts.is_empty() {
        options.prompt = Some(prompt_parts.join(" "));
    }
    Ok((command, options))
}

fn required_value(arguments: &[String], index: usize, flag: &str) -> io::Result<String> {
    arguments
        .get(index)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{flag} requires a value"),
            )
        })
}

fn parse_agent(value: &str) -> io::Result<AgentMode> {
    match value.to_ascii_lowercase().as_str() {
        "build" | "regular" | "runtime" => Ok(AgentMode::Regular),
        "plan" => Ok(AgentMode::Plan),
        "audit" => Ok(AgentMode::Audit),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("unsupported agent '{value}'; use build, plan, or audit"),
        )),
    }
}

fn parse_model(value: &str) -> io::Result<types::ModelRef> {
    let (provider, model) = value.split_once('/').ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "--model must use provider/model format",
        )
    })?;
    let provider_id = match provider.to_ascii_lowercase().as_str() {
        "openai" => types::ProviderId::OpenAi,
        "openai-native" => types::ProviderId::OpenAiNative,
        "anthropic" => types::ProviderId::Anthropic,
        "gemini" | "google" => types::ProviderId::Gemini,
        "bedrock" => types::ProviderId::Bedrock,
        "vertex" => types::ProviderId::Vertex,
        "mistral" => types::ProviderId::Mistral,
        "openai-compatible" | "compatible" => types::ProviderId::OpenAiCompatible,
        "lm-studio" | "lmstudio" => types::ProviderId::LmStudio,
        "ollama" => types::ProviderId::Ollama,
        "openrouter" => types::ProviderId::OpenRouter,
        "opencode" => types::ProviderId::OpenCode,
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("unsupported provider '{provider}'"),
            ));
        }
    };
    if model.trim().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "--model requires a model name",
        ));
    }
    Ok(types::ModelRef {
        provider_id,
        model_id: model.to_owned(),
    })
}

fn print_help() {
    println!(
        "LETTERBLACK ENGINE\n\nUsage:\n  lbe                         Start the TUI\n  lbe [project]               Start the TUI in a project\n  lbe run \"prompt\"           Run a governed task without the TUI\n\nOptions:\n  -m, --model PROVIDER/MODEL  Select a model\n      --agent build|plan|audit\n  -s, --session SESSION_ID    Resume a specific session\n  -c, --continue              Continue the current session\n      --prompt TEXT           Supply the task prompt\n      --json                  Emit headless events as JSON\n  -h, --help                  Show this help\n  -V, --version               Show the version\n\nThe current LBE runtime intentionally rejects --auto, --fork, and --port.\nAuthorization and execution remain governed by LBE."
    );
}

fn run_headless(options: CliOptions) -> io::Result<i32> {
    let prompt = headless_prompt_value(options.prompt)?;
    let use_real_runtime = !matches!(std::env::var("LBE_RUNTIME").as_deref(), Ok("mock"));
    let mut wrapper = WrapperClient::spawn(use_real_runtime);
    let mut app = App::with_snapshot(wrapper.snapshot());
    let mut submitted = false;
    let mut startup_initialized = false;
    let mut startup_model_applied = options.model.is_some();
    let mut model_catalog_ready = false;
    let mode = options.mode.unwrap_or(AgentMode::Regular);
    let deadline = Instant::now() + Duration::from_secs(180);

    while Instant::now() < deadline {
        if let Some(event) = wrapper
            .poll_event(Instant::now())
            .map_err(|error| io::Error::other(error.message))?
        {
            if matches!(&event, LbeEvent::ModelCatalogDiscovered { .. }) {
                model_catalog_ready = true;
            }
            let is_initial_snapshot =
                !startup_initialized && matches!(event, LbeEvent::SnapshotUpdated { .. });
            emit_headless_event(&event)?;
            let is_error = matches!(event, LbeEvent::WrapperError { .. });
            app.reduce_lbe_event(event);
            if is_error {
                eprintln!("lbe headless: runtime error");
                wrapper.shutdown();
                return Ok(1);
            }
            if is_initial_snapshot {
                startup_initialized = true;
                if let Some(mode) = options.mode.filter(|_| options.session_id.is_none()) {
                    wrapper
                        .submit(requests::UserRequest::SetMode { mode }, Instant::now())
                        .map_err(|error| io::Error::other(error.message))?;
                }
                if let Some(session_id) = options.session_id.clone().or_else(|| {
                    options
                        .continue_session
                        .then(|| app.snapshot.session_id.clone())
                        .flatten()
                }) {
                    wrapper
                        .submit(
                            requests::UserRequest::ResumeSession { session_id },
                            Instant::now(),
                        )
                        .map_err(|error| io::Error::other(error.message))?;
                }
                if use_real_runtime && options.model.is_none() {
                    wrapper
                        .submit(
                            requests::UserRequest::RefreshProviderCatalog,
                            Instant::now(),
                        )
                        .map_err(|error| io::Error::other(error.message))?;
                }
            }
            if !submitted && !startup_model_applied {
                if let Some(model) = options.model.clone() {
                    let model_discovered = model_catalog_ready
                        && app.snapshot.models.iter().any(|candidate| {
                            candidate.provider_id == model.provider_id
                                && candidate.model_id == model.model_id
                        });
                    if model_discovered {
                        wrapper
                            .submit(requests::UserRequest::SelectModel { model }, Instant::now())
                            .map_err(|error| io::Error::other(error.message))?;
                        startup_model_applied = true;
                    }
                }
            }
            let session_ready =
                app.snapshot.session_id.is_some() && app.snapshot.workspace_id.is_some();
            let model_ready = if options.model.is_some() {
                startup_model_applied
            } else {
                model_catalog_ready
            };
            if !submitted && session_ready && model_ready {
                wrapper
                    .submit(
                        requests::UserRequest::SubmitTask {
                            intent: prompt.clone(),
                            mode,
                        },
                        Instant::now(),
                    )
                    .map_err(|error| io::Error::other(error.message))?;
                submitted = true;
            }
            if submitted && matches!(app.phase, Phase::Completed) {
                emit_headless_result(&app, "completed")?;
                wrapper.shutdown();
                return Ok(0);
            }
            if submitted && matches!(app.phase, Phase::AwaitingApproval { .. }) {
                emit_headless_result(&app, "approval_required")?;
                wrapper.shutdown();
                return Ok(2);
            }
            continue;
        }
        std::thread::sleep(Duration::from_millis(5));
    }

    eprintln!("lbe headless: timed out waiting for governed completion");
    emit_headless_result(&app, "timeout")?;
    wrapper.shutdown();
    Ok(1)
}

fn headless_prompt(arguments: &[String]) -> io::Result<String> {
    let prompt = arguments
        .iter()
        .skip_while(|argument| argument.as_str() != "--no-tui")
        .skip(1)
        .filter(|argument| argument.as_str() != "--json")
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");
    headless_prompt_value((!prompt.trim().is_empty()).then_some(prompt))
}

fn headless_prompt_value(prompt: Option<String>) -> io::Result<String> {
    if let Some(prompt) = prompt.filter(|value| !value.trim().is_empty()) {
        return Ok(prompt);
    }
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin)?;
    let prompt = stdin.trim().to_owned();
    if prompt.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "run requires a prompt argument, --prompt, or stdin input",
        ));
    }
    Ok(prompt)
}

fn emit_headless_event(event: &LbeEvent) -> io::Result<()> {
    let value = match event {
        LbeEvent::WrapperError { message } => serde_json::json!({
            "type": "error",
            "message": message,
        }),
        LbeEvent::AssistantTextDelta { text } => serde_json::json!({
            "type": "assistant_text",
            "text": text,
        }),
        LbeEvent::ConversationalTurnMessage {
            session_id,
            turn_id,
            event_id,
            text,
        } => serde_json::json!({
            "type": "turn_message",
            "session_id": session_id,
            "turn_id": turn_id,
            "event_id": event_id,
            "text": text,
        }),
        LbeEvent::ConversationalToolReceipt {
            session_id,
            turn_id,
            event_id,
            operation_id,
            tool_id,
            status,
            receipt_id,
            evidence_ref,
        } => serde_json::json!({
            "type": "tool_receipt",
            "session_id": session_id,
            "turn_id": turn_id,
            "event_id": event_id,
            "operation_id": operation_id,
            "tool_id": tool_id,
            "status": status,
            "receipt_id": receipt_id,
            "evidence_ref": evidence_ref,
        }),
        LbeEvent::ConversationalTurnCompleted {
            session_id,
            turn_id,
            event_id,
        } => serde_json::json!({
            "type": "turn_completed",
            "session_id": session_id,
            "turn_id": turn_id,
            "event_id": event_id,
        }),
        LbeEvent::AuthorizationRequired {
            operation_id,
            approval_id,
            capability,
            rationale,
        } => serde_json::json!({
            "type": "authorization_required",
            "operation_id": operation_id,
            "approval_id": approval_id,
            "capability": capability,
            "rationale": rationale,
        }),
        LbeEvent::AuthorizationResolved {
            operation_id,
            approval_id,
            verdict,
            rationale,
        } => serde_json::json!({
            "type": "authorization_resolved",
            "operation_id": operation_id,
            "approval_id": approval_id,
            "verdict": verdict,
            "rationale": rationale,
        }),
        LbeEvent::ExecutionStarted { execution_id } => serde_json::json!({
            "type": "execution_started",
            "execution_id": execution_id,
        }),
        LbeEvent::ExecutionCompleted {
            execution_id,
            receipt_id,
        } => serde_json::json!({
            "type": "execution_completed",
            "execution_id": execution_id,
            "receipt_id": receipt_id,
        }),
        LbeEvent::LbeCompletionAccepted {
            execution_id,
            receipt_id,
        } => serde_json::json!({
            "type": "completion_accepted",
            "execution_id": execution_id,
            "receipt_id": receipt_id,
        }),
        LbeEvent::SnapshotUpdated { snapshot } => serde_json::json!({
            "type": "snapshot",
            "connection": format!("{:?}", snapshot.connection),
            "session_id": snapshot.session_id,
            "workspace_id": snapshot.workspace_id,
            "session_state": format!("{:?}", snapshot.session_state),
        }),
        _ => serde_json::json!({
            "type": "runtime_event",
            "event": format!("{event:?}"),
        }),
    };
    println!(
        "{}",
        serde_json::to_string(&value).expect("headless event JSON is serializable")
    );
    Ok(())
}

fn emit_headless_result(app: &App, status: &str) -> io::Result<()> {
    let value = serde_json::json!({
        "type": "result",
        "status": status,
        "phase": format!("{:?}", app.phase),
        "session_id": app.snapshot.session_id,
        "turn_id": app.snapshot.turn_id,
        "transcript": app.transcript,
    });
    println!(
        "{}",
        serde_json::to_string(&value).expect("headless result JSON is serializable")
    );
    Ok(())
}

fn run(
    terminal: &mut ui::AppTerminal,
    events: &EventReader,
    options: CliOptions,
) -> io::Result<()> {
    let use_real_runtime = !matches!(std::env::var("LBE_RUNTIME").as_deref(), Ok("mock"));
    let mut wrapper = WrapperClient::spawn(use_real_runtime);
    let mut app = App::with_snapshot(wrapper.snapshot());
    if let Some(prompt) = options.prompt.clone() {
        app.input = prompt;
    }
    let mut workspace_list_requested = false;
    let mut startup_options_applied = false;
    let mut startup_model_applied = options.model.is_none();
    let animation_started = Instant::now();

    while !app.should_quit() {
        terminal.draw(|frame| ui::draw_at(frame, &app, animation_started.elapsed()))?;

        let now = Instant::now();

        if let Some(event) = wrapper
            .poll_event(now)
            .map_err(|error| io::Error::other(error.message))?
        {
            let has_model_catalog = matches!(&event, LbeEvent::ModelCatalogDiscovered { .. });
            let has_authoritative_workspace = matches!(
                &event,
                LbeEvent::SnapshotUpdated { snapshot }
                    if snapshot.workspace_id.is_some()
            );
            app.reduce_lbe_event(event);
            if use_real_runtime && !startup_options_applied && has_authoritative_workspace {
                startup_options_applied = true;
                if let Some(mode) = options.mode {
                    app.apply_wrapper_result(
                        wrapper.submit(requests::UserRequest::SetMode { mode }, Instant::now()),
                    );
                }
                if let Some(session_id) = options.session_id.clone().or_else(|| {
                    options
                        .continue_session
                        .then(|| app.snapshot.session_id.clone())
                        .flatten()
                }) {
                    app.apply_wrapper_result(wrapper.submit(
                        requests::UserRequest::ResumeSession { session_id },
                        Instant::now(),
                    ));
                }
            }
            if use_real_runtime && !startup_model_applied && has_model_catalog {
                if let Some(model) = options.model.clone() {
                    app.apply_wrapper_result(
                        wrapper
                            .submit(requests::UserRequest::SelectModel { model }, Instant::now()),
                    );
                    startup_model_applied = true;
                }
            }
            app.continue_authorized_patch(&mut wrapper, Instant::now());
            if use_real_runtime && has_authoritative_workspace && !workspace_list_requested {
                workspace_list_requested = true;
                app.apply_wrapper_result(wrapper.submit(
                    requests::UserRequest::ListWorkspace {
                        path: ".".to_owned(),
                    },
                    Instant::now(),
                ));
            }
            continue;
        }

        let animation_wake = Duration::from_millis(225);
        let timeout = match (app.next_wake(now), wrapper.next_wake(now), animation_wake) {
            (Some(app_wake), Some(wrapper_wake), animation_wake) => {
                Some(app_wake.min(wrapper_wake).min(animation_wake))
            }
            (Some(app_wake), None, animation_wake) => Some(app_wake.min(animation_wake)),
            (None, Some(wrapper_wake), animation_wake) => Some(wrapper_wake.min(animation_wake)),
            (None, None, animation_wake) => Some(animation_wake),
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

    wrapper.shutdown();
    Ok(())
}
