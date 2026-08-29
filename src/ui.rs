use std::{
    io::{self, Write as _},
    time::{Duration, Instant},
};

use ratatui::termina::{
    EventReader, PlatformTerminal, Terminal as _,
    escape::csi::{Csi, DecPrivateMode, DecPrivateModeCode, Mode},
};
use ratatui::{
    Terminal,
    backend::TerminaBackend,
    layout::{Alignment, Constraint, Layout, Margin},
    prelude::*,
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Wrap},
};

use crate::{app::App, types::*};

pub(crate) type AppTerminal = Terminal<TerminaBackend<PlatformTerminal>>;

pub(crate) fn init_terminal() -> io::Result<(AppTerminal, EventReader)> {
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

pub(crate) fn restore_terminal(terminal: &mut AppTerminal) -> io::Result<()> {
    let backend = terminal.backend_mut();
    write!(backend, "{}", terminal_restore_sequence())?;
    std::io::Write::flush(backend)
}

pub(crate) fn terminal_restore_sequence() -> String {
    format!("{}{}", alternate_screen(false), cursor_visible(true))
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

pub(crate) fn draw(frame: &mut Frame, app: &App) {
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
    draw_header(frame, sections[1], app);
    draw_body(frame, sections[2], app);
    draw_composer(frame, sections[3], app);
    draw_footer(frame, sections[4], app);
}

pub(crate) fn draw_chrome(frame: &mut Frame, area: Rect) {
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

pub(crate) fn draw_header(frame: &mut Frame, area: Rect, app: &App) {
    let connection = app.snapshot.connection;
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
            format!(
                "                 {} {} · UI CONTRACT PREVIEW",
                connection.marker(),
                connection.label()
            ),
            Style::default().fg(connection.color()),
        ),
    ]);
    frame.render_widget(
        Paragraph::new(line).style(Style::default().bg(PALETTE.bg)),
        area,
    );
}

pub(crate) fn draw_body(frame: &mut Frame, area: Rect, app: &App) {
    let content = if let Some(panel) = app.panel {
        mock_panel_text(panel, &app.snapshot)
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

pub(crate) fn draw_composer(frame: &mut Frame, area: Rect, app: &App) {
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
        Phase::AwaitingApproval { proposal, .. } => {
            format!("> {proposal}   [Enter] approve   [Esc] reject")
        }
        Phase::Running => "> Execution in progress…".to_owned(),
        Phase::Interrupted => "> Execution interrupted; runtime truth unresolved…".to_owned(),
        _ if app.input.is_empty() => format!("> {}", mode_placeholder(app.agent_mode)),
        _ => format!("> {}", app.input),
    };

    let composer_style = if matches!(app.phase, Phase::Running | Phase::Interrupted) {
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

pub(crate) fn draw_footer(frame: &mut Frame, area: Rect, app: &App) {
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

pub(crate) fn context_meter(used: usize, capacity: usize, width: usize) -> String {
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
        Line::from("/read   inspect a relative path through Agent Wall"),
        Line::from("/list   list a relative directory through Agent Wall"),
        Line::from("/glob   match relative paths through Agent Wall"),
        Line::from("/search search workspace evidence through Agent Wall"),
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

pub(crate) fn mock_panel_text(panel: MockPanel, snapshot: &LbeSnapshot) -> Text<'static> {
    let (title, rows): (&str, Vec<String>) = match panel {
        MockPanel::Account => (
            "Account",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Canonical account/auth state is runtime-owned.".to_owned(),
            ],
        ),
        MockPanel::Provider => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock provider catalog; no credentials, network, or provider calls.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.providers.iter().map(|provider| {
                let local = if provider.is_local { " · LOCAL" } else { "" };
                format!(
                    "{}  {} · {}{}",
                    provider.provider_id.label(),
                    provider.auth_state.label(),
                    provider.health.label(),
                    local
                )
            }));
            ("Providers", rows)
        }
        MockPanel::Model => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock provider-discovered catalog; capability values are not live.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.models.iter().map(|model| {
                format!(
                    "{} · {} · context {} · output {}",
                    model.provider_id.label(),
                    model.display_name,
                    model
                        .context_window
                        .map_or_else(|| "unknown".to_owned(), |value| value.to_string()),
                    model
                        .max_output_tokens
                        .map_or_else(|| "unknown".to_owned(), |value| value.to_string())
                )
            }));
            rows.extend(snapshot.models.iter().map(|model| {
                format!(
                    "  streaming {} · tools {} · reasoning {} · images {} · caching {}",
                    capability_marker(model.capabilities.streaming),
                    capability_marker(model.capabilities.tools),
                    capability_marker(model.capabilities.reasoning),
                    capability_marker(model.capabilities.images),
                    capability_marker(model.capabilities.prompt_caching),
                )
            }));
            ("Models", rows)
        }
        MockPanel::Mcp => (
            "MCP",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "No MCP server registry or transport is connected.".to_owned(),
            ],
        ),
        MockPanel::Tools => (
            "Tools",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "No canonical typed tool registry or policy is connected.".to_owned(),
            ],
        ),
        MockPanel::History => (
            "History",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Only in-memory composer recall is available.".to_owned(),
            ],
        ),
        MockPanel::Session => {
            let lineage = &snapshot.lineage;
            let parent = lineage.parent_session_id.as_deref().unwrap_or("none");
            let connected = snapshot.connection == RuntimeConnection::Connected;
            let status = if connected {
                format!(
                    "{} · authoritative Agent Wall projection",
                    snapshot.connection.label()
                )
            } else {
                format!("{} · UI contract preview", snapshot.connection.label())
            };
            (
                "Session",
                vec![
                    status,
                    format!(
                        "Session {}",
                        snapshot.session_id.as_deref().unwrap_or("not attached")
                    ),
                    format!(
                        "Workspace {}",
                        snapshot.workspace_id.as_deref().unwrap_or("not attached")
                    ),
                    format!(
                        "Root {} · parent {} · origin {}",
                        lineage.root_session_id,
                        parent,
                        lineage.origin.label()
                    ),
                    if connected {
                        "Session identity is projected from the connected LBE runtime.".to_owned()
                    } else {
                        "No durable session owner is connected.".to_owned()
                    },
                ],
            )
        }
        MockPanel::Evidence => (
            "Evidence",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Current evidence refs require canonical LBE runtime output.".to_owned(),
            ],
        ),
        MockPanel::Receipts => (
            "Receipts",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Mock receipt rcpt_demo_7f31 is not a canonical receipt.".to_owned(),
            ],
        ),
        MockPanel::Status => (
            "Status",
            vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                format!(
                    "Runtime {} · {} · attached clients {}",
                    snapshot.runtime_id.as_deref().unwrap_or("not attached"),
                    snapshot.runtime_mode.label(),
                    snapshot.attached_client_count
                ),
                format!(
                    "Session {} · compaction {} · retry {}/{} · timeout {}/{}s",
                    snapshot.session_state.label(),
                    snapshot.compaction_state.label(),
                    snapshot.retry_count,
                    snapshot.retry_limit,
                    snapshot.elapsed_seconds,
                    snapshot.timeout_seconds
                ),
                "All values are mock projections; no runtime is attached.".to_owned(),
            ],
        ),
        MockPanel::Memory => {
            let mut rows = vec![
                "LOCAL UI MEMORY · NON-CANONICAL · PRE-INTEGRATION".to_owned(),
                "Canonical durable memory and verified promotion remain LBE-runtime-owned."
                    .to_owned(),
                String::new(),
                format!(
                    "Current session hash: {}",
                    snapshot
                        .memory
                        .current_session_hash
                        .as_deref()
                        .unwrap_or("not indexed")
                ),
                format!("Indexed sessions: {}", snapshot.memory.indexed_sessions),
                format!("Memory records:   {}", snapshot.memory.indexed_memories),
                format!(
                    "Last recall:      {}",
                    snapshot
                        .memory
                        .last_recall_query
                        .as_deref()
                        .unwrap_or("none")
                ),
                String::new(),
            ];
            if snapshot.memory.recent_records.is_empty() {
                rows.push("No recalled records projected in the mock TUI.".to_owned());
            } else {
                rows.push("Relevant:".to_owned());
                rows.extend(snapshot.memory.recent_records.iter().map(|record| {
                    format!(
                        "• {} · {} · {} · {}",
                        record.session_id,
                        record.record_type.label(),
                        record.truth.label(),
                        record.summary
                    )
                }));
            }
            ("Memory", rows)
        }
        MockPanel::Browser => {
            let browser = &snapshot.browser_chat;
            let connection = if browser.attached {
                "● ATTACHED"
            } else {
                "○ DETACHED"
            };
            (
                "Browser Chat",
                vec![
                    "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                    "Browser chat is a conversation surface; LBE remains execution authority."
                        .to_owned(),
                    String::new(),
                    format!(
                        "Provider        {}",
                        browser
                            .provider
                            .as_ref()
                            .map_or("not attached", |provider| provider.label())
                    ),
                    format!("Connection      {connection}"),
                    format!(
                        "Browser session {}",
                        browser.browser_session_id.as_deref().unwrap_or("none")
                    ),
                    format!(
                        "LBE session     {}",
                        browser.lbe_session_id.as_deref().unwrap_or("none")
                    ),
                    format!(
                        "Turn            {}",
                        browser.last_lbe_turn_id.as_deref().unwrap_or("none")
                    ),
                    format!(
                        "Memory          {}",
                        if snapshot.memory.current_session_hash.is_some() {
                            "linked"
                        } else {
                            "not linked"
                        }
                    ),
                    format!(
                        "Last receipt    {}",
                        browser.last_receipt_id.as_deref().unwrap_or("none")
                    ),
                    String::new(),
                    format!(
                        "Conversation    {}",
                        browser.conversation_ref.as_deref().unwrap_or("none")
                    ),
                    String::new(),
                    "Status".to_owned(),
                    browser.status.clone(),
                ],
            )
        }
        MockPanel::Undo => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Checkpoint projection; restore originates from the canonical LBE runtime."
                    .to_owned(),
                String::new(),
            ];
            if let Some(checkpoint) = &snapshot.latest_checkpoint {
                rows.push(format!(
                    "{} · {} · {} file(s) changed",
                    checkpoint.checkpoint_id,
                    checkpoint.created_at,
                    checkpoint.changed_files.len()
                ));
                rows.push(format!(
                    "workspace revision {}",
                    checkpoint.workspace_revision
                ));
            } else {
                rows.push("No checkpoint has been created in this mock session.".to_owned());
            }
            ("Undo", rows)
        }
        MockPanel::Doctor => {
            let mut rows = vec![
                "MOCK / NOT CONNECTED · UI CONTRACT PREVIEW".to_owned(),
                "Mock diagnostics; no live checks are executed.".to_owned(),
                String::new(),
            ];
            rows.extend(snapshot.diagnostics.iter().map(|check| {
                let remediation = if check.remediation_available {
                    " · remediation available"
                } else {
                    ""
                };
                format!(
                    "{}  {} · {} · {}{}",
                    check.status.label(),
                    check.category,
                    check.id,
                    check.message,
                    remediation
                )
            }));
            ("Doctor", rows)
        }
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
        rows.into_iter()
            .map(|row| Line::from(Span::styled(row, Style::default().fg(PALETTE.muted)))),
    );
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Esc closes this view",
        Style::default().fg(PALETTE.faint),
    )));
    Text::from(lines)
}

fn capability_marker(enabled: bool) -> &'static str {
    if enabled { "●" } else { "○" }
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

pub(crate) fn logo_cell_visible(row: usize, column: usize, elapsed: Duration) -> bool {
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

pub(crate) fn center_bar_visible(elapsed: Duration) -> bool {
    if elapsed < BAR_REVEAL {
        return false;
    }
    if elapsed < BAR_BLINK_START {
        return true;
    }
    ((elapsed - BAR_BLINK_START).as_millis() / BAR_BLINK_HALF_PERIOD.as_millis()) % 2 == 1
}

pub(crate) fn logo_cell_style(row: usize, column: usize) -> Style {
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
