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
    AwaitingApproval { proposal: String },
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct LbeSnapshot {
    workspace_label: String,
    model_id: String,
    model_family: String,
    effort_label: Option<String>,
    context_used: usize,
    context_capacity: usize,
    active_mode: AgentMode,
    runtime_label: String,
}

impl Default for LbeSnapshot {
    fn default() -> Self {
        Self {
            workspace_label: r"C:\Users\".to_owned(),
            model_id: "Model ID".to_owned(),
            model_family: "Gemini".to_owned(),
            effort_label: Some("low".to_owned()),
            context_used: 2,
            context_capacity: 10,
            active_mode: AgentMode::Regular,
            runtime_label: "MOCK / NOT CONNECTED".to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UserRequest {
    intent: String,
    mode: AgentMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LbeError {
    message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum LbeEvent {
    SnapshotUpdated { snapshot: LbeSnapshot },
    ProposalCreated { proposal: String },
    PlanUpdated { text: String },
    AuditVerdict { verdict: String },
    ExecutionStarted,
    ExecutionOutput { text: String },
    ValidationCompleted { result: String },
    ExecutionCompleted { receipt_id: String },
    ExecutionRejected,
}

#[derive(Debug)]
struct ScheduledLbeEvent {
    due_at: Instant,
    event: LbeEvent,
}

trait LbeWrapper {
    fn snapshot(&self) -> LbeSnapshot;
    fn submit(&mut self, request: UserRequest, now: Instant) -> Result<(), LbeError>;
    fn approve(&mut self, approval_id: &str, now: Instant) -> Result<(), LbeError>;
    fn reject(&mut self, approval_id: &str) -> Result<(), LbeError>;
    fn set_mode(&mut self, mode: AgentMode) -> Result<(), LbeError>;
    fn poll_event(&mut self, now: Instant) -> Result<Option<LbeEvent>, LbeError>;
    fn abort(&mut self) -> Result<(), LbeError>;
    fn next_wake(&self, now: Instant) -> Option<Duration>;
}

#[derive(Debug, Default)]
struct MockLbeWrapper {
    snapshot: LbeSnapshot,
    scheduled: VecDeque<ScheduledLbeEvent>,
}

impl MockLbeWrapper {
    fn emit(&mut self, event: LbeEvent) {
        self.scheduled.push_back(ScheduledLbeEvent {
            due_at: Instant::now(),
            event,
        });
    }
}

impl LbeWrapper for MockLbeWrapper {
    fn snapshot(&self) -> LbeSnapshot {
        self.snapshot.clone()
    }

    fn submit(&mut self, request: UserRequest, _now: Instant) -> Result<(), LbeError> {
        match request.mode {
            AgentMode::Regular => self.emit(LbeEvent::ProposalCreated {
                proposal: format!("Proposed: {}", request.intent),
            }),
            AgentMode::Plan => self.emit(LbeEvent::PlanUpdated {
                text: format!(
                    "Mock plan: investigate {}; no execution requested.",
                    request.intent
                ),
            }),
            AgentMode::Audit => self.emit(LbeEvent::AuditVerdict {
                verdict: "INSUFFICIENT_EVIDENCE · mock runtime is not connected to LBE guards."
                    .to_owned(),
            }),
        }
        Ok(())
    }

    fn approve(&mut self, _approval_id: &str, now: Instant) -> Result<(), LbeError> {
        self.scheduled.clear();
        self.emit(LbeEvent::ExecutionStarted);
        self.scheduled.extend([
            ScheduledLbeEvent {
                due_at: now + Duration::from_millis(250),
                event: LbeEvent::ExecutionOutput {
                    text: "Inspecting active workspace...".to_owned(),
                },
            },
            ScheduledLbeEvent {
                due_at: now + Duration::from_millis(650),
                event: LbeEvent::ValidationCompleted {
                    result: "Focused validation complete.".to_owned(),
                },
            },
            ScheduledLbeEvent {
                due_at: now + Duration::from_millis(950),
                event: LbeEvent::ExecutionCompleted {
                    receipt_id: "rcpt_demo_7f31".to_owned(),
                },
            },
        ]);
        Ok(())
    }

    fn reject(&mut self, _approval_id: &str) -> Result<(), LbeError> {
        self.scheduled.clear();
        self.emit(LbeEvent::ExecutionRejected);
        Ok(())
    }

    fn set_mode(&mut self, mode: AgentMode) -> Result<(), LbeError> {
        self.snapshot.active_mode = mode;
        self.emit(LbeEvent::SnapshotUpdated {
            snapshot: self.snapshot(),
        });
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

    fn abort(&mut self) -> Result<(), LbeError> {
        self.scheduled.clear();
        self.emit(LbeEvent::ExecutionRejected);
        Ok(())
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
                self.apply_wrapper_result(wrapper.abort());
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
            Phase::AwaitingApproval { .. } => {
                self.apply_wrapper_result(wrapper.approve("mock_approval", now));
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
                    UserRequest {
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
        if matches!(self.phase, Phase::AwaitingApproval { .. }) {
            self.apply_wrapper_result(wrapper.reject("mock_approval"));
        }
    }

    fn set_mode(&mut self, wrapper: &mut impl LbeWrapper, mode: AgentMode) {
        self.apply_wrapper_result(wrapper.set_mode(mode));
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
            "/provider" => Some(MockPanel::Provider),
            "/model" => Some(MockPanel::Model),
            "/mcp" => Some(MockPanel::Mcp),
            "/tools" => Some(MockPanel::Tools),
            "/history" => Some(MockPanel::History),
            "/session" => Some(MockPanel::Session),
            "/evidence" => Some(MockPanel::Evidence),
            "/receipts" => Some(MockPanel::Receipts),
            "/status" => Some(MockPanel::Status),
            "/undo" => Some(MockPanel::Undo),
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
                self.transcript.push(
                    "SYSTEM  compact requested; unavailable until runtime/session integration."
                        .to_owned(),
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
            LbeEvent::SnapshotUpdated { snapshot } => {
                self.agent_mode = snapshot.active_mode;
                self.snapshot = snapshot;
            }
            LbeEvent::ProposalCreated { proposal } => {
                self.phase = Phase::AwaitingApproval { proposal };
            }
            LbeEvent::PlanUpdated { text } => {
                self.transcript.push(format!("PLAN  {text}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::AuditVerdict { verdict } => {
                self.transcript.push(format!("AUDIT  {verdict}"));
                self.phase = Phase::Welcome;
            }
            LbeEvent::ExecutionStarted => {
                if let Phase::AwaitingApproval { proposal } = &self.phase {
                    self.transcript.push(format!("lbe runtime  {proposal}"));
                }
                self.transcript
                    .push("lbe runtime  EXECUTION STARTED".to_owned());
                self.phase = Phase::Running;
            }
            LbeEvent::ExecutionOutput { text } => {
                self.transcript.push(format!("  {text}"));
            }
            LbeEvent::ValidationCompleted { result } => {
                self.transcript.push(format!("VALIDATION  {result}"));
            }
            LbeEvent::ExecutionCompleted { receipt_id } => {
                self.transcript
                    .push(format!("LBE RUNTIME  COMPLETED · receipt {receipt_id}"));
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
    draw_header(frame, sections[1]);
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

fn draw_header(frame: &mut Frame, area: Rect) {
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
            "                              ● runtime connected",
            Style::default().fg(PALETTE.green),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(line).style(Style::default().bg(PALETTE.bg)),
        area,
    );
}

fn draw_body(frame: &mut Frame, area: Rect, app: &App) {
    let content = if let Some(panel) = app.panel {
        mock_panel_text(panel)
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
        Phase::AwaitingApproval { proposal } => {
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

fn mock_panel_text(panel: MockPanel) -> Text<'static> {
    let (title, rows): (&str, &[&str]) = match panel {
        MockPanel::Account => (
            "Account",
            &[
                "MOCK / NOT CONNECTED",
                "Canonical account/auth state is runtime-owned.",
            ],
        ),
        MockPanel::Provider => (
            "Provider",
            &[
                "MOCK / NOT CONNECTED",
                "No canonical provider registry is connected.",
            ],
        ),
        MockPanel::Model => (
            "Choose model",
            &[
                "MOCK / NOT CONNECTED",
                "Model ID · low",
                "Gemini context projection is presentation-only.",
            ],
        ),
        MockPanel::Mcp => (
            "MCP",
            &[
                "MOCK / NOT CONNECTED",
                "No MCP server registry or transport is connected.",
            ],
        ),
        MockPanel::Tools => (
            "Tools",
            &[
                "MOCK / NOT CONNECTED",
                "No canonical typed tool registry or policy is connected.",
            ],
        ),
        MockPanel::History => (
            "History",
            &[
                "MOCK / NOT CONNECTED",
                "Only in-memory composer recall is available.",
            ],
        ),
        MockPanel::Session => (
            "Session",
            &[
                "MOCK / NOT CONNECTED",
                "No durable session owner is connected.",
            ],
        ),
        MockPanel::Evidence => (
            "Evidence",
            &[
                "MOCK / NOT CONNECTED",
                "Current evidence refs require canonical LBE runtime output.",
            ],
        ),
        MockPanel::Receipts => (
            "Receipts",
            &[
                "MOCK / NOT CONNECTED",
                "Mock receipt rcpt_demo_7f31 is not a canonical receipt.",
            ],
        ),
        MockPanel::Status => (
            "Status",
            &[
                "MOCK / NOT CONNECTED",
                "Workspace, provider, and context values are local projections.",
            ],
        ),
        MockPanel::Undo => (
            "Undo",
            &[
                "MOCK / NOT CONNECTED",
                "Checkpoint restore must be requested from canonical LBE runtime.",
            ],
        ),
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
        rows.iter()
            .map(|row| Line::from(Span::styled(*row, Style::default().fg(PALETTE.muted)))),
    );
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Esc closes this view",
        Style::default().fg(PALETTE.faint),
    )));
    Text::from(lines)
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
        assert!(matches!(app.phase, Phase::AwaitingApproval { .. }));
        app.submit_or_approve(&mut wrapper, now);
        app.reduce_lbe_event(wrapper.poll_event(Instant::now()).unwrap().unwrap());
        assert_eq!(app.phase, Phase::Running);
        app.reduce_lbe_event(
            wrapper
                .poll_event(now + Duration::from_millis(250))
                .unwrap()
                .unwrap(),
        );
        app.reduce_lbe_event(
            wrapper
                .poll_event(now + Duration::from_millis(650))
                .unwrap()
                .unwrap(),
        );
        app.reduce_lbe_event(
            wrapper
                .poll_event(now + Duration::from_millis(950))
                .unwrap()
                .unwrap(),
        );
        assert_eq!(app.phase, Phase::Completed);
        assert!(
            app.transcript
                .iter()
                .any(|line| line.contains("rcpt_demo_7f31"))
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
    fn commands_open_mock_panels_without_claiming_runtime_integration() {
        let mut app = App::default();
        let mut wrapper = MockLbeWrapper::default();
        app.handle_command("/tools", &mut wrapper);
        assert_eq!(app.panel, Some(MockPanel::Tools));
        let text = mock_panel_text(MockPanel::Tools).to_string();
        assert!(text.contains("MOCK / NOT CONNECTED"));
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
        assert_eq!(snapshot.runtime_label, "MOCK / NOT CONNECTED");
        wrapper.set_mode(AgentMode::Plan).unwrap();
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
