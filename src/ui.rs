use std::{
    io::{self, Write as _},
    time::Duration,
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
use unicode_width::UnicodeWidthChar;

use crate::{
    app::{App, command_palette_commands},
    types::*,
};

pub(crate) type AppTerminal = Terminal<TerminaBackend<PlatformTerminal>>;

pub(crate) fn no_color_enabled() -> bool {
    std::env::var_os("NO_COLOR").is_some_and(|value| !value.is_empty())
}

pub(crate) fn ascii_mode_enabled() -> bool {
    std::env::var_os("LBE_ASCII").is_some_and(|value| !value.is_empty())
}

pub(crate) fn display_token(
    unicode: &'static str,
    ascii: &'static str,
    ascii_mode: bool,
) -> &'static str {
    if ascii_mode { ascii } else { unicode }
}

pub(crate) fn init_terminal() -> io::Result<(AppTerminal, EventReader)> {
    let mut output = PlatformTerminal::new()?;
    output.set_panic_hook(|output| {
        let _ = write!(
            output,
            "{}{}",
            alternate_screen(false),
            terminal_cursor_visible(true)
        );
        let _ = output.flush();
    });
    output.enter_raw_mode()?;
    write!(
        output,
        "{}{}",
        alternate_screen(true),
        terminal_cursor_visible(false)
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
    format!(
        "{}{}",
        alternate_screen(false),
        terminal_cursor_visible(true)
    )
}

fn alternate_screen(enabled: bool) -> Csi {
    let mode = DecPrivateMode::Code(DecPrivateModeCode::ClearAndEnableAlternateScreen);
    if enabled {
        Csi::Mode(Mode::SetDecPrivateMode(mode))
    } else {
        Csi::Mode(Mode::ResetDecPrivateMode(mode))
    }
}

fn terminal_cursor_visible(visible: bool) -> Csi {
    let mode = DecPrivateMode::Code(DecPrivateModeCode::ShowCursor);
    if visible {
        Csi::Mode(Mode::SetDecPrivateMode(mode))
    } else {
        Csi::Mode(Mode::ResetDecPrivateMode(mode))
    }
}

pub(crate) fn draw(frame: &mut Frame, app: &App) {
    draw_at(frame, app, Duration::from_secs(2));
}

pub(crate) fn draw_at(frame: &mut Frame, app: &App, elapsed: Duration) {
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

    // Below the comfortable desktop breakpoint, remove decorative chrome and
    // give the transcript the space. The declared 60-column floor is useful
    // only if it has a compact, single-pane presentation.
    let safe_area = area.inner(Margin::new(if area.width < 72 { 1 } else { 2 }, 1));
    let compact = safe_area.width < 72 || safe_area.height < 20;
    if compact {
        let sections = Layout::vertical([
            Constraint::Length(2),
            Constraint::Length(1),
            Constraint::Min(2),
            Constraint::Length(2),
            Constraint::Length(1),
        ])
        .split(safe_area);
        draw_chrome(frame, sections[0]);
        draw_header(frame, sections[1], app);
        draw_body(frame, sections[2], app);
        draw_composer(frame, sections[3], app, elapsed);
        draw_footer(frame, sections[4], app);
    } else {
        let sections = Layout::vertical([
            Constraint::Length(2),
            Constraint::Length(1),
            Constraint::Min(10),
            Constraint::Length(3),
            Constraint::Length(2),
        ])
        .split(safe_area);
        draw_chrome(frame, sections[0]);
        draw_header(frame, sections[1], app);
        draw_body(frame, sections[2], app);
        draw_composer(frame, sections[3], app, elapsed);
        draw_footer(frame, sections[4], app);
    }
    if no_color_enabled() {
        for cell in frame.buffer_mut().content.iter_mut() {
            cell.set_style(Style::default());
        }
    }
}

pub(crate) fn draw_chrome(frame: &mut Frame, area: Rect) {
    frame.render_widget(
        Block::default().style(Style::default().bg(Color::Rgb(10, 12, 15))),
        area,
    );
}

pub(crate) fn draw_header(frame: &mut Frame, area: Rect, app: &App) {
    let connection = app.snapshot.connection;
    let connection_label = if connection == RuntimeConnection::Connected {
        " LIVE "
    } else {
        " PREVIEW "
    };
    let connection_style = Style::default()
        .fg(PALETTE.bg)
        .bg(connection.color())
        .add_modifier(Modifier::BOLD);
    let inner = area.inner(Margin::new(if area.width < 72 { 1 } else { 2 }, 0));
    let header_columns =
        Layout::horizontal([Constraint::Length(18), Constraint::Min(1)]).split(inner);
    let brand = Line::from(vec![
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
    ]);
    frame.render_widget(
        Paragraph::new(brand).style(Style::default().bg(PALETTE.bg)),
        header_columns[0],
    );
    let status = format!(
        "{} {} · {} · {}{}",
        connection.marker(),
        connection.label(),
        if connection == RuntimeConnection::Connected {
            "AGENT WALL"
        } else {
            "UI CONTRACT PREVIEW"
        },
        app.agent_mode.label(),
        connection_label,
    );
    frame.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(
                truncate_text(
                    &status,
                    header_columns[1]
                        .width
                        .saturating_sub(connection_label.len() as u16) as usize,
                ),
                Style::default().fg(connection.color()),
            ),
            Span::styled(connection_label, connection_style),
        ]))
        .style(Style::default().bg(PALETTE.bg))
        .alignment(Alignment::Right),
        header_columns[1],
    );
}

pub(crate) fn draw_body(frame: &mut Frame, area: Rect, app: &App) {
    if area.width >= 112 {
        let columns = Layout::horizontal([Constraint::Length(28), Constraint::Min(1)]).split(area);
        draw_navigation_sidebar(frame, columns[0], app);
        draw_main_body(frame, columns[1], app, true);
        return;
    }

    draw_main_body(frame, area, app, false);
}

fn draw_navigation_sidebar(frame: &mut Frame, area: Rect, app: &App) {
    let block = Block::default()
        .borders(Borders::RIGHT)
        .border_style(Style::default().fg(PALETTE.line))
        .style(Style::default().bg(PALETTE.bg));
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let session = app.snapshot.session_id.as_deref().unwrap_or("not attached");
    let workspace = if app.snapshot.workspace_label.is_empty() {
        "not attached"
    } else {
        app.snapshot.workspace_label.as_str()
    };
    let mut lines = vec![
        Line::from(Span::styled(
            "WORKSPACE",
            Style::default()
                .fg(PALETTE.amber)
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::styled(
            truncate_text(workspace, inner.width as usize),
            Style::default().fg(PALETTE.faint),
        )),
        Line::default(),
        Line::from(Span::styled(
            "CURRENT SESSION",
            Style::default().fg(PALETTE.muted),
        )),
        Line::from(Span::styled(
            truncate_text(session, inner.width as usize),
            Style::default().fg(PALETTE.ink),
        )),
        Line::from(Span::styled(
            truncate_text(
                &format!(
                    "{} · {}",
                    app.snapshot.session_state.label(),
                    app.agent_mode.label()
                ),
                inner.width as usize,
            ),
            Style::default().fg(app.snapshot.connection.color()),
        )),
        Line::default(),
    ];
    let runtime_status = if app.snapshot.connection == RuntimeConnection::Connected {
        "LIVE · authoritative runtime attached"
    } else {
        "PREVIEW · no runtime attached"
    };
    lines.push(Line::from(Span::styled(
        truncate_text(runtime_status, inner.width as usize),
        Style::default().fg(app.snapshot.connection.color()),
    )));
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        truncate_text("Tab mode · F2 provider · F3 model", inner.width as usize),
        Style::default().fg(PALETTE.faint),
    )));
    frame.render_widget(Paragraph::new(Text::from(lines)), inner);
}

fn draw_workspace_sidebar(frame: &mut Frame, area: Rect, app: &App) {
    let block = Block::default()
        .borders(Borders::RIGHT)
        .border_style(Style::default().fg(PALETTE.line))
        .style(Style::default().bg(PALETTE.bg));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let mut lines = vec![Line::from(Span::styled(
        "FILES // WORKSPACE",
        Style::default()
            .fg(PALETTE.amber)
            .add_modifier(Modifier::BOLD),
    ))];
    if let Some(listing) = &app.workspace_listing {
        lines.push(Line::from(Span::styled(
            truncate_text(&listing.path, inner.width.saturating_sub(1) as usize),
            Style::default().fg(PALETTE.faint),
        )));
        lines.push(Line::default());
        if listing.entries.is_empty() {
            lines.push(Line::from(Span::styled(
                "(empty)",
                Style::default().fg(PALETTE.muted),
            )));
        } else {
            for (index, entry) in listing.entries.iter().enumerate() {
                let selected = index == app.workspace_cursor;
                let marker = if entry.entry_type == "directory" {
                    "▸"
                } else {
                    "·"
                };
                let row_style = if selected {
                    Style::default()
                        .fg(PALETTE.bg)
                        .bg(PALETTE.amber)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(PALETTE.ink)
                };
                lines.push(Line::from(vec![
                    Span::styled(
                        format!("{} ", if selected { "▸" } else { marker }),
                        if selected {
                            row_style
                        } else {
                            Style::default().fg(if entry.entry_type == "directory" {
                                PALETTE.amber
                            } else {
                                PALETTE.faint
                            })
                        },
                    ),
                    Span::styled(
                        truncate_text(&entry.name, inner.width.saturating_sub(4) as usize),
                        row_style,
                    ),
                ]));
            }
        }
        lines.push(Line::default());
        lines.push(Line::from(Span::styled(
            format!("{} entries · read-only", listing.entries.len()),
            Style::default().fg(PALETTE.faint),
        )));
        lines.push(Line::from(Span::styled(
            "↑↓ move · Enter open",
            Style::default().fg(PALETTE.amber),
        )));
    } else {
        lines.push(Line::default());
        lines.push(Line::from(Span::styled(
            "waiting for Agent Wall…",
            Style::default().fg(PALETTE.muted),
        )));
    }
    frame.render_widget(Paragraph::new(Text::from(lines)).scroll((0, 0)), inner);
}

fn draw_main_body(frame: &mut Frame, area: Rect, app: &App, split_layout: bool) {
    let welcome = app.transcript.is_empty()
        && app.panel.is_none()
        && app.workspace_patch.is_none()
        && app.workspace_file.is_none()
        && app.workspace_listing.is_none()
        && !app.show_shortcuts
        && !app.show_command_palette
        && app.agent_mode != AgentMode::Audit;
    let content = if split_layout
        && app.panel.is_none()
        && app.workspace_patch.is_none()
        && app.workspace_file.is_none()
        && !app.show_shortcuts
        && app.agent_mode != AgentMode::Audit
    {
        transcript_text(app)
    } else if app.show_command_palette {
        command_palette_text(app)
    } else if let Some(panel) = app.panel {
        mock_panel_text_for_app(panel, app)
    } else if let Phase::PatchReview {
        path,
        expected_sha256,
        replacement_content,
    } = &app.phase
    {
        patch_review_text(path, expected_sha256, replacement_content)
    } else if let Some(patch) = &app.workspace_patch {
        workspace_patch_text(patch)
    } else if let Some(file) = &app.workspace_file {
        workspace_file_text(file, app.workspace_file_scroll)
    } else if let Some(listing) = &app.workspace_listing {
        workspace_listing_text(listing)
    } else if app.show_shortcuts {
        shortcut_text()
    } else if app.agent_mode == AgentMode::Audit {
        audit_text(app)
    } else if app.transcript.is_empty() {
        welcome_text(area.height, app)
    } else {
        transcript_text(app)
    };
    let scroll = if app.agent_mode == AgentMode::Audit {
        app.audit_scroll.min(u16::MAX as usize) as u16
    } else if app.workspace_file.is_some() || app.workspace_listing.is_some() {
        0
    } else if app.transcript.is_empty()
        && app.panel.is_none()
        && app.workspace_patch.is_none()
        && app.workspace_file.is_none()
        && app.workspace_listing.is_none()
        && !app.show_shortcuts
        && !app.show_command_palette
    {
        0
    } else {
        transcript_scroll_offset(&content, app.transcript_scroll, area.height)
    };
    frame.render_widget(
        Paragraph::new(content)
            .alignment(if welcome {
                Alignment::Center
            } else {
                Alignment::Left
            })
            .style(Style::default().fg(PALETTE.ink).bg(PALETTE.bg))
            .wrap(Wrap { trim: true })
            .scroll((scroll, 0)),
        area.inner(Margin::new(if area.width < 72 { 1 } else { 2 }, 0)),
    );
}

fn workspace_patch_text(patch: &WorkspacePatch) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        format!("Patch · {}", patch.path),
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        format!(
            "{} · {} byte(s) · before {} · after {}",
            if patch.updated {
                "updated"
            } else {
                "unchanged"
            },
            patch.bytes,
            patch.before_sha256,
            patch.sha256
        ),
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::from(Span::styled(
        format!(
            "receipt {} · evidence {} · LBE result",
            patch.receipt_id,
            patch.evidence_ref.as_deref().unwrap_or("none")
        ),
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::default());
    lines.extend(patch.patch.lines().map(|line| {
        Line::from(Span::styled(
            line.to_owned(),
            Style::default().fg(if line.starts_with('+') {
                PALETTE.green
            } else if line.starts_with('-') {
                PALETTE.red
            } else {
                PALETTE.ink
            }),
        ))
    }));
    Text::from(lines)
}

fn transcript_scroll_offset(
    content: &Text<'static>,
    requested: Option<usize>,
    viewport_height: u16,
) -> u16 {
    let max_offset = content.height().saturating_sub(viewport_height as usize);
    requested
        .unwrap_or(max_offset)
        .min(max_offset)
        .min(u16::MAX as usize) as u16
}

fn workspace_file_text(file: &WorkspaceFile, scroll: usize) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        format!("File · {}", file.path),
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        format!(
            "read-only · sha256 {} · evidence {} · receipt {}",
            file.content_sha256,
            file.evidence_ref.as_deref().unwrap_or("none"),
            file.receipt_id.as_deref().unwrap_or("none")
        ),
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::default());
    lines.extend(
        file.content
            .lines()
            .enumerate()
            .skip(scroll)
            .map(|(index, line)| {
                Line::from(Span::styled(
                    format!("{:>4}  {line}", index + scroll + 1),
                    Style::default().fg(PALETTE.ink),
                ))
            }),
    );
    Text::from(lines)
}

fn patch_review_text(
    path: &str,
    expected_sha256: &str,
    replacement_content: &str,
) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        format!("Patch review · {path}"),
        Style::default()
            .fg(PALETTE.amber)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        format!(
            "expected sha256 {expected_sha256} · {} replacement line(s)",
            replacement_content.lines().count()
        ),
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::from(Span::styled(
        "AUTHORIZATION PENDING · no mutation has been submitted",
        Style::default().fg(PALETTE.amber),
    )));
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Proposed replacement:",
        Style::default().fg(PALETTE.muted),
    )));
    lines.extend(
        replacement_content
            .lines()
            .enumerate()
            .map(|(index, line)| {
                Line::from(Span::styled(
                    format!("+ {:>4}  {line}", index + 1),
                    Style::default().fg(PALETTE.green),
                ))
            }),
    );
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Enter requests LBE authorization · Esc cancels",
        Style::default().fg(PALETTE.amber),
    )));
    Text::from(lines)
}

fn workspace_listing_text(listing: &WorkspaceListing) -> Text<'static> {
    let mut lines = vec![Line::from(vec![Span::styled(
        format!("Workspace · {}", listing.path),
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )])];
    lines.push(Line::from(Span::styled(
        format!(
            "{} entrie(s) · evidence {} · receipt {}",
            listing.entries.len(),
            listing.evidence_ref.as_deref().unwrap_or("none"),
            listing.receipt_id.as_deref().unwrap_or("none")
        ),
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::default());
    if listing.entries.is_empty() {
        lines.push(Line::from(Span::styled(
            "No entries returned by Agent Wall.",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(listing.entries.iter().map(|entry| {
            let marker = if entry.entry_type == "directory" {
                "▸"
            } else {
                "·"
            };
            Line::from(Span::styled(
                format!("{marker} {}  {}", entry.name, entry.entry_type),
                Style::default().fg(PALETTE.ink),
            ))
        }));
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "/open <path> reads through Agent Wall; file content remains runtime-owned",
        Style::default().fg(PALETTE.faint),
    )));
    Text::from(lines)
}

pub(crate) fn draw_composer(frame: &mut Frame, area: Rect, app: &App, elapsed: Duration) {
    let cursor = if input_cursor_visible(elapsed) {
        "|"
    } else {
        " "
    };
    let composer_text = match &app.phase {
        Phase::AwaitingApproval { proposal, .. } => {
            format!("> {proposal} · Enter approve · Esc reject")
        }
        Phase::Running => format!("> Execution in progress {cursor}"),
        Phase::Interrupted => format!("> Execution interrupted; runtime truth unresolved {cursor}"),
        _ if app.input.is_empty() => format!("> {} {cursor}", mode_placeholder(app.agent_mode)),
        _ => format!("> {}{cursor}", app.input),
    };

    let composer_style = if matches!(app.phase, Phase::Running | Phase::Interrupted) {
        Style::default().fg(PALETTE.muted)
    } else {
        Style::default().fg(PALETTE.ink)
    };

    let rule = "─".repeat(area.width as usize);
    if area.height >= 3 {
        let rows = Layout::vertical([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .split(area);
        frame.render_widget(
            Paragraph::new(rule.clone()).style(Style::default().fg(PALETTE.line).bg(PALETTE.bg)),
            rows[0],
        );
        frame.render_widget(
            Paragraph::new(composer_text).style(composer_style.bg(PALETTE.bg)),
            rows[1],
        );
        frame.render_widget(
            Paragraph::new(rule).style(Style::default().fg(PALETTE.line).bg(PALETTE.bg)),
            rows[2],
        );
    } else {
        frame.render_widget(
            Paragraph::new(composer_text).style(composer_style.bg(PALETTE.bg)),
            area,
        );
    }
}

pub(crate) fn draw_footer(frame: &mut Frame, area: Rect, app: &App) {
    if area.width < 72 || area.height < 2 {
        let hint = if matches!(app.phase, Phase::AwaitingApproval { .. }) {
            "Enter approve · Esc reject · ? help"
        } else if matches!(app.phase, Phase::Running) {
            "Ctrl+C abort · ? help"
        } else if app.show_shortcuts {
            "? close help · Esc close view"
        } else {
            "Enter submit · Ctrl+P commands · F2 provider · F3 model"
        };
        frame.render_widget(
            Paragraph::new(truncate_text(hint, area.width as usize))
                .style(Style::default().fg(PALETTE.faint).bg(PALETTE.bg)),
            area,
        );
        return;
    }
    let rows = Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).split(area);

    let shortcut_label = if app.show_shortcuts {
        "? close shortcuts"
    } else {
        "? for shortcuts · Ctrl+P commands · F2 provider · F3 model"
    };

    let top = Layout::horizontal([
        Constraint::Length(16),
        Constraint::Min(1),
        Constraint::Length(16),
    ])
    .split(rows[0]);

    frame.render_widget(
        Paragraph::new(truncate_text(shortcut_label, top[0].width as usize))
            .style(Style::default().fg(PALETTE.faint).bg(PALETTE.bg))
            .alignment(Alignment::Left),
        top[0],
    );

    let mode_line = if top[1].width < 40 {
        Line::from(Span::styled(
            truncate_text(
                &format!("Mode: {} (Tab)", app.agent_mode.label()),
                top[1].width as usize,
            ),
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        ))
    } else {
        Line::from(vec![
            mode_indicator("Lbe Audit", app.agent_mode == AgentMode::Audit),
            Span::styled("/", Style::default().fg(PALETTE.faint)),
            mode_indicator("Runtime", app.agent_mode == AgentMode::Regular),
            Span::styled("/", Style::default().fg(PALETTE.faint)),
            mode_indicator("Plan", app.agent_mode == AgentMode::Plan),
            Span::styled(" (Tab)", Style::default().fg(PALETTE.faint)),
        ])
    };
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
        Paragraph::new(truncate_text(&model_status, top[2].width as usize))
            .style(Style::default().fg(PALETTE.faint).bg(PALETTE.bg))
            .alignment(Alignment::Right),
        top[2],
    );

    let bottom =
        Layout::horizontal([Constraint::Percentage(50), Constraint::Percentage(50)]).split(rows[1]);

    frame.render_widget(
        Paragraph::new(truncate_text(
            &app.snapshot.workspace_label,
            bottom[0].width as usize,
        ))
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

pub(crate) fn truncate_text(value: &str, width: usize) -> String {
    if width == 0 {
        return String::new();
    }
    let value_width = value
        .chars()
        .map(|character| character.width().unwrap_or(0))
        .sum::<usize>();
    if value_width <= width {
        return value.to_owned();
    }
    if width <= 1 {
        return "…".to_owned();
    }
    let mut result = String::new();
    let mut used = 0;
    for character in value.chars() {
        let character_width = character.width().unwrap_or(0);
        if used + character_width > width - 1 {
            break;
        }
        result.push(character);
        used += character_width;
    }
    result + display_token("…", "...", ascii_mode_enabled())
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
    let marker = if selected {
        display_token("●", "*", ascii_mode_enabled())
    } else {
        display_token("○", "-", ascii_mode_enabled())
    };
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
        Line::from("Tab     cycle Runtime, Plan, and Audit"),
        Line::from("F2/F3   open the live provider/model selectors"),
        Line::from("↑/↓     move files; scroll open files or transcript"),
        Line::from("Enter   open the selected file/directory in the workspace pane"),
        Line::from("Ctrl+L  clear rendered mock transcript"),
        Line::from("Ctrl+P  open command palette"),
        Line::from("chat    describe the task; the agent selects governed capabilities"),
        Line::from("/open   optional developer/agent workspace inspection"),
        Line::from("/patch  optional developer/agent governed patch path"),
        Line::from("/run    optional developer/agent registered-process path"),
        Line::from("/authorize optional developer/agent authorization probe"),
        Line::from("Ctrl+D  exit when the composer is empty"),
        Line::from("?       close this shortcut reference"),
        Line::from("q       quit when the task input is empty"),
        Line::from("Ctrl+C  quit cleanly"),
    ])
}

fn command_palette_text(app: &App) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        "Command palette",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        "↑↓ choose · Enter run · Esc close",
        Style::default().fg(PALETTE.amber),
    )));
    lines.push(Line::default());
    lines.extend(command_palette_commands().iter().enumerate().map(
        |(index, (command, description))| {
            let selected = index == app.command_palette_index;
            let style = if selected {
                Style::default()
                    .fg(PALETTE.bg)
                    .bg(PALETTE.amber)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(PALETTE.ink)
            };
            Line::from(Span::styled(
                format!(
                    "{} {command:<12} · {description}",
                    if selected { "▸" } else { " " }
                ),
                style,
            ))
        },
    ));
    Text::from(lines)
}

fn audit_text(app: &App) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        "AUDIT MODE // READ-ONLY",
        Style::default()
            .fg(PALETTE.amber)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        "Inspect the current LBE projection before proposing any change.",
        Style::default().fg(PALETTE.muted),
    )));
    lines.push(Line::default());

    let runtime = format!(
        "{} {} · mode {} · clients {}",
        app.snapshot.connection.marker(),
        app.snapshot.connection.label(),
        app.snapshot.runtime_mode.label(),
        app.snapshot.attached_client_count
    );
    lines.push(Line::from(vec![
        Span::styled("Runtime   ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            runtime,
            Style::default().fg(app.snapshot.connection.color()),
        ),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Workspace  ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            format!(
                "{} · {}",
                app.snapshot.workspace_label,
                app.snapshot
                    .workspace_id
                    .as_deref()
                    .unwrap_or("not attached")
            ),
            Style::default().fg(PALETTE.ink),
        ),
    ]));
    let selected = app.snapshot.selected_model.as_ref().map_or_else(
        || "not selected".to_owned(),
        |model| format!("{} / {}", model.provider_id.label(), model.model_id),
    );
    lines.push(Line::from(vec![
        Span::styled("Model     ", Style::default().fg(PALETTE.faint)),
        Span::styled(selected, Style::default().fg(PALETTE.amber)),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Policy    ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            "read-only · authorization required for mutation",
            Style::default().fg(PALETTE.green),
        ),
    ]));
    lines.push(Line::default());

    let pass_count = app
        .snapshot
        .diagnostics
        .iter()
        .filter(|check| check.status == DiagnosticStatus::Pass)
        .count();
    let warning_count = app
        .snapshot
        .diagnostics
        .iter()
        .filter(|check| check.status == DiagnosticStatus::Warning)
        .count();
    let fail_count = app
        .snapshot
        .diagnostics
        .iter()
        .filter(|check| check.status == DiagnosticStatus::Fail)
        .count();
    lines.push(Line::from(Span::styled(
        format!("CHECKS    pass {pass_count} · warning {warning_count} · fail {fail_count}",),
        Style::default().fg(if fail_count > 0 {
            PALETTE.red
        } else if warning_count > 0 {
            PALETTE.amber
        } else {
            PALETTE.green
        }),
    )));
    lines.push(Line::from(Span::styled(
        format!(
            "TRACE     {} event(s) · {} evidence · {} receipt(s)",
            app.activity_log.len(),
            app.evidence_records.len(),
            app.receipt_records.len()
        ),
        Style::default().fg(PALETTE.faint),
    )));
    let verdict = app
        .audit_verdict
        .as_deref()
        .unwrap_or("not yet projected by LBE")
        .to_owned();
    lines.push(Line::from(vec![
        Span::styled("VERDICT   ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            verdict,
            Style::default().fg(if app.audit_verdict.is_some() {
                PALETTE.green
            } else {
                PALETTE.muted
            }),
        ),
    ]));
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Grouped findings",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    if app.audit_findings.is_empty() {
        lines.push(Line::from(Span::styled(
            "  none projected",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        for category in [
            "Runtime",
            "Tool",
            "Validation",
            "Authorization",
            "Execution",
            "Timeout",
            "Retry",
            "Checkpoint",
            "Context",
            "Browser",
        ] {
            for finding in app
                .audit_findings
                .iter()
                .filter(|finding| finding.category == category)
            {
                lines.push(Line::from(Span::styled(
                    format!("  [{category}] {}", finding.detail),
                    Style::default().fg(PALETTE.red),
                )));
            }
        }
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Affected files",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    if app.audit_affected_files.is_empty() {
        lines.push(Line::from(Span::styled(
            "  none projected",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(app.audit_affected_files.iter().map(|path| {
            Line::from(Span::styled(
                format!("  · {path}"),
                Style::default().fg(PALETTE.amber),
            ))
        }));
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Evidence links",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    if app.evidence_records.is_empty() {
        lines.push(Line::from(Span::styled(
            "  none projected",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(app.evidence_records.iter().map(|record| {
            Line::from(Span::styled(
                format!("  · {} · {}", record.reference, record.source),
                Style::default().fg(PALETTE.green),
            ))
        }));
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Tool trace",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    if app.audit_tool_trace.is_empty() {
        lines.push(Line::from(Span::styled(
            "  none projected",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(app.audit_tool_trace.iter().rev().take(8).map(|entry| {
            Line::from(Span::styled(
                format!("  · {entry}"),
                Style::default().fg(PALETTE.faint),
            ))
        }));
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Recent activity",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    )));
    if app.activity_log.is_empty() {
        lines.push(Line::from(Span::styled(
            "  waiting for authoritative runtime events",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(app.activity_log.iter().rev().take(5).map(|event| {
            Line::from(Span::styled(
                format!("  · {event}"),
                Style::default().fg(PALETTE.faint),
            ))
        }));
    }
    lines.push(Line::default());
    lines.push(Line::from(Span::styled(
        "Enter submit audit request · Tab change mode · ? shortcuts",
        Style::default().fg(PALETTE.amber),
    )));
    Text::from(lines)
}

fn mode_placeholder(mode: AgentMode) -> &'static str {
    match mode {
        AgentMode::Audit => "Ask the agent to investigate workspace evidence (read-only)",
        AgentMode::Regular => "Describe what you want the agent to do",
        AgentMode::Plan => "Investigate or propose a plan (no execution)",
    }
}

pub(crate) fn mock_panel_text(panel: MockPanel, snapshot: &LbeSnapshot) -> Text<'static> {
    let (title, rows): (&str, Vec<String>) = match panel {
        MockPanel::Activity => (
            "Activity",
            vec![
                "NO RUNTIME ACTIVITY PROJECTED".to_owned(),
                "Open /activity after an authoritative event is received.".to_owned(),
            ],
        ),
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
        MockPanel::Processes => (
            "Processes",
            vec![
                "MOCK / NOT CONNECTED".to_owned(),
                "Open through the app-aware renderer for projected command activity.".to_owned(),
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
                    format!("Known sessions {}", snapshot.sessions.len()),
                    if snapshot.sessions.is_empty() {
                        "No session summaries projected.".to_owned()
                    } else {
                        snapshot
                            .sessions
                            .iter()
                            .take(5)
                            .map(|session| {
                                format!(
                                    "  {} · {} · parent {}",
                                    session.session_id,
                                    session.status.label(),
                                    session.parent_session_id.as_deref().unwrap_or("none")
                                )
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    },
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
                "CHECKPOINTS ? PROJECTION ONLY".to_owned(),
                "[c] compare   [r] request restore   [Esc] close".to_owned(),
                String::new(),
            ];
            if let Some(checkpoint) = &snapshot.latest_checkpoint {
                rows.push(format!(
                    "{} ? {} ? {} file(s) changed",
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
            ("Checkpoints", rows)
        }
        MockPanel::Changes => {
            let mut rows = vec![
                "WORKSPACE CHANGES · PROJECTION ONLY".to_owned(),
                "[c] compare checkpoint   [Esc] close".to_owned(),
                String::new(),
            ];
            if let Some(checkpoint) = &snapshot.latest_checkpoint {
                rows.push(format!(
                    "checkpoint {} · revision {} · {} file(s)",
                    checkpoint.checkpoint_id,
                    checkpoint.workspace_revision,
                    checkpoint.changed_files.len()
                ));
                rows.extend(
                    checkpoint
                        .changed_files
                        .iter()
                        .map(|path| format!("[changed] {path}")),
                );
            } else {
                rows.push("No authoritative workspace changes projected.".to_owned());
            }
            ("Workspace Changes", rows)
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

pub(crate) fn mock_panel_text_for_app(panel: MockPanel, app: &App) -> Text<'static> {
    // Activity is rendered from the app projection below.
    if panel == MockPanel::Activity {
        let mut lines = vec![Line::from(Span::styled(
            "Activity timeline",
            Style::default()
                .fg(PALETTE.ink)
                .add_modifier(Modifier::BOLD),
        ))];
        lines.push(Line::from(Span::styled(
            "Authoritative event-type projection - no execution authority",
            Style::default().fg(PALETTE.faint),
        )));
        lines.push(Line::default());
        if app.activity_log.is_empty() {
            lines.push(Line::from(Span::styled(
                "No runtime events projected.",
                Style::default().fg(PALETTE.muted),
            )));
        } else {
            lines.extend(
                app.activity_log
                    .iter()
                    .enumerate()
                    .map(|(index, event)| Line::from(format!("{:>2}  {event}", index + 1))),
            );
        }
        lines.push(Line::default());
        lines.push(Line::from(Span::styled(
            "Events are display-only; LBE remains the runtime authority.",
            Style::default().fg(PALETTE.faint),
        )));
        return Text::from(lines);
    }
    match panel {
        MockPanel::Provider => provider_panel_text(app),
        MockPanel::Model => model_picker_text(app),
        MockPanel::Mcp => mcp_panel_text(app),
        MockPanel::Session if !app.snapshot.sessions.is_empty() => {
            let mut lines = vec![Line::from(Span::styled(
                "Sessions",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(Span::styled(
                "↑↓ choose session · Enter resume · Esc close",
                Style::default().fg(PALETTE.amber),
            )));
            lines.push(Line::default());
            lines.extend(
                app.snapshot
                    .sessions
                    .iter()
                    .enumerate()
                    .map(|(index, session)| {
                        let marker = if index == app.session_picker_index {
                            "[>]"
                        } else {
                            "[ ]"
                        };
                        let style = if index == app.session_picker_index {
                            Style::default()
                                .fg(PALETTE.bg)
                                .bg(PALETTE.amber)
                                .add_modifier(Modifier::BOLD)
                        } else {
                            Style::default().fg(PALETTE.ink)
                        };
                        Line::from(Span::styled(
                            format!(
                                "{marker} {} · {} · parent {}",
                                session.session_id,
                                session.status.label(),
                                session.parent_session_id.as_deref().unwrap_or("none")
                            ),
                            style,
                        ))
                    }),
            );
            Text::from(lines)
        }
        MockPanel::Account => {
            let mut lines = vec![Line::from(Span::styled(
                "Authorization",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            if let Some(verdict) = &app.last_authorization_verdict {
                lines.push(Line::from(format!(
                    "verdict {} · capability {}",
                    verdict,
                    app.last_authorization_capability
                        .as_deref()
                        .unwrap_or("unknown")
                )));
                lines.push(Line::from(format!(
                    "operation {} · approval {}",
                    app.last_authorization_operation_id
                        .as_deref()
                        .unwrap_or("unknown"),
                    app.last_authorization_approval_id
                        .as_deref()
                        .unwrap_or("none")
                )));
                lines.push(Line::from(format!(
                    "rationale {}",
                    app.last_authorization_rationale
                        .as_deref()
                        .unwrap_or("none")
                )));
                lines.push(Line::from(Span::styled(
                    "Projection only; authorization remains LBE-runtime-owned.",
                    Style::default().fg(PALETTE.faint),
                )));
            } else {
                lines.push(Line::from(Span::styled(
                    "No authorization decision projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        MockPanel::Tools => {
            let mut lines = vec![Line::from(Span::styled(
                "Tools",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(format!(
                "{} · {}",
                app.snapshot.connection.label(),
                if app.snapshot.connection == RuntimeConnection::Connected {
                    "authoritative LBE tool projection"
                } else {
                    "tool projection unavailable"
                }
            )));
            if let Some(tool_name) = &app.last_tool_name {
                lines.push(Line::from(format!(
                    "{} · state {} · risk {}",
                    tool_name,
                    app.last_tool_state.as_deref().unwrap_or("UNKNOWN"),
                    app.last_tool_risk.as_deref().unwrap_or("unknown")
                )));
                lines.push(Line::from(format!(
                    "input {}",
                    app.last_tool_input.as_deref().unwrap_or("none")
                )));
                lines.push(Line::from(format!(
                    "tool call {}",
                    app.last_tool_call_id.as_deref().unwrap_or("none")
                )));
                lines.push(Line::from(Span::styled(
                    "detail: observed request only; no permission is granted here.",
                    Style::default().fg(PALETTE.muted),
                )));
                lines.push(Line::from(Span::styled(
                    "Projection only; authorization and permissions remain runtime-owned.",
                    Style::default().fg(PALETTE.faint),
                )));
            } else {
                lines.push(Line::from(Span::styled(
                    "No tool request projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        MockPanel::Processes => {
            let mut lines = vec![Line::from(Span::styled(
                "Processes",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(format!(
                "{} · {}",
                app.snapshot.connection.label(),
                if app.snapshot.connection == RuntimeConnection::Connected {
                    "authoritative LBE process projection"
                } else {
                    "process projection unavailable"
                }
            )));
            if let Some(command_id) = &app.last_process_command_id {
                lines.push(Line::from(format!(
                    "{} · state {}",
                    command_id,
                    app.last_process_state.as_deref().unwrap_or("UNKNOWN")
                )));
                lines.push(Line::from(format!(
                    "tool call {} · exit {} · log {}",
                    app.last_process_tool_call_id.as_deref().unwrap_or("none"),
                    app.last_process_exit_code
                        .map_or_else(|| "none".to_owned(), |code| code.to_string()),
                    if app.last_process_log_available {
                        "available"
                    } else {
                        "not available"
                    }
                )));
                lines.push(Line::from(format!(
                    "activity {}",
                    app.last_process_activity.as_deref().unwrap_or("none")
                )));
                if !app.last_process_detail.is_empty() {
                    lines.push(Line::from(Span::styled(
                        "detail",
                        Style::default().fg(PALETTE.muted),
                    )));
                    lines.extend(app.last_process_detail.iter().map(|entry| {
                        Line::from(Span::styled(
                            format!("  {entry}"),
                            Style::default().fg(PALETTE.ink),
                        ))
                    }));
                }
                lines.push(Line::from(Span::styled(
                    "Projection only; process control remains runtime-owned.",
                    Style::default().fg(PALETTE.faint),
                )));
            } else {
                lines.push(Line::from(Span::styled(
                    "No command activity projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        MockPanel::Evidence => {
            let mut lines = vec![Line::from(Span::styled(
                "Evidence",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            if let Some(listing) = &app.workspace_listing {
                lines.push(Line::from(format!(
                    "workspace.list · {} · receipt {}",
                    listing.evidence_ref.as_deref().unwrap_or("none"),
                    listing.receipt_id.as_deref().unwrap_or("none")
                )));
            }
            if let Some(file) = &app.workspace_file {
                lines.push(Line::from(format!(
                    "workspace.read · {} · receipt {}",
                    file.evidence_ref.as_deref().unwrap_or("none"),
                    file.receipt_id.as_deref().unwrap_or("none")
                )));
            }
            if let Some(evidence_ref) = &app.last_execution_evidence_ref {
                lines.push(Line::from(format!(
                    "execution · {evidence_ref} · receipt {}",
                    app.last_execution_receipt_id.as_deref().unwrap_or("none")
                )));
            }
            for record in &app.evidence_records {
                lines.push(Line::from(format!(
                    "{} · {} · {}",
                    record.reference, record.source, record.summary
                )));
            }
            if lines.len() == 1 {
                lines.push(Line::from(Span::styled(
                    "No canonical evidence reference projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        MockPanel::Undo => {
            let mut lines = vec![Line::from(Span::styled(
                "Checkpoints",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(Span::styled(
                "[c] compare   [r] request restore   [Esc] close",
                Style::default().fg(PALETTE.faint),
            )));
            if let Some(checkpoint) = &app.snapshot.latest_checkpoint {
                lines.push(Line::from(format!(
                    "{} ? {} ? {} file(s) changed",
                    checkpoint.checkpoint_id,
                    checkpoint.created_at,
                    checkpoint.changed_files.len()
                )));
                lines.push(Line::from(format!(
                    "workspace revision {}",
                    checkpoint.workspace_revision
                )));
                if !app.checkpoint_changed_files.is_empty() {
                    lines.push(Line::from(Span::styled(
                        "Comparison",
                        Style::default().fg(PALETTE.ink),
                    )));
                    lines.extend(app.checkpoint_changed_files.iter().map(|path| {
                        Line::from(Span::styled(
                            format!("[>] {path}"),
                            Style::default().fg(PALETTE.muted),
                        ))
                    }));
                }
                if let Some(status) = &app.checkpoint_restore_status {
                    let color = if status.starts_with("BLOCKED") {
                        PALETTE.red
                    } else {
                        PALETTE.green
                    };
                    lines.push(Line::from(Span::styled(
                        format!("Restore status  {status}"),
                        Style::default().fg(color),
                    )));
                }
            } else {
                lines.push(Line::from(Span::styled(
                    "No checkpoint has been created in this session.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        MockPanel::Changes => {
            let mut lines = vec![Line::from(Span::styled(
                "Workspace Changes",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(Span::styled(
                "[c] compare checkpoint   [Esc] close",
                Style::default().fg(PALETTE.faint),
            )));
            if let Some(checkpoint) = &app.snapshot.latest_checkpoint {
                lines.push(Line::from(format!(
                    "checkpoint {} · revision {} · {} file(s)",
                    checkpoint.checkpoint_id,
                    checkpoint.workspace_revision,
                    checkpoint.changed_files.len()
                )));
                lines.extend(checkpoint.changed_files.iter().map(|path| {
                    Line::from(Span::styled(
                        format!("[changed] {path}"),
                        Style::default().fg(PALETTE.muted),
                    ))
                }));
            } else {
                lines.push(Line::from(Span::styled(
                    "No authoritative workspace changes projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            if let Some(patch) = &app.workspace_patch {
                lines.push(Line::default());
                lines.push(Line::from(format!(
                    "latest patch {} · receipt {} · evidence {}",
                    patch.path,
                    patch.receipt_id,
                    patch.evidence_ref.as_deref().unwrap_or("none")
                )));
                lines.push(Line::from(format!(
                    "hash {} -> {} · {} byte(s)",
                    patch.before_sha256, patch.sha256, patch.bytes
                )));
            }
            Text::from(lines)
        }
        MockPanel::Receipts => {
            let mut lines = vec![Line::from(Span::styled(
                "Receipts",
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD),
            ))];
            lines.push(Line::from(format!(
                "{} · {}",
                app.snapshot.connection.label(),
                if app.snapshot.connection == RuntimeConnection::Connected {
                    "authoritative LBE receipt projection"
                } else {
                    "receipt projection unavailable"
                }
            )));
            if let Some(listing) = &app.workspace_listing {
                lines.push(Line::from(format!(
                    "workspace.list · receipt {} · evidence {}",
                    listing.receipt_id.as_deref().unwrap_or("none"),
                    listing.evidence_ref.as_deref().unwrap_or("none")
                )));
            }
            if let Some(file) = &app.workspace_file {
                lines.push(Line::from(format!(
                    "workspace.read · receipt {} · evidence {}",
                    file.receipt_id.as_deref().unwrap_or("none"),
                    file.evidence_ref.as_deref().unwrap_or("none")
                )));
            }
            if let Some(receipt_id) = &app.last_execution_receipt_id {
                lines.push(Line::from(format!(
                    "execution · receipt {receipt_id} · evidence {}",
                    app.last_execution_evidence_ref.as_deref().unwrap_or("none")
                )));
            }
            for record in &app.receipt_records {
                lines.push(Line::from(format!(
                    "{} · {} · {} · evidence {}",
                    record.receipt_id,
                    record.source,
                    record.status,
                    record.evidence_ref.as_deref().unwrap_or("none")
                )));
            }
            if app.workspace_listing.is_none()
                && app.workspace_file.is_none()
                && app.last_execution_receipt_id.is_none()
                && app.receipt_records.is_empty()
            {
                lines.push(Line::from(Span::styled(
                    "No canonical receipt projected.",
                    Style::default().fg(PALETTE.muted),
                )));
            }
            Text::from(lines)
        }
        _ => mock_panel_text(panel, &app.snapshot),
    }
}

fn provider_panel_text(app: &App) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        "Providers",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    let connected = app.snapshot.connection == RuntimeConnection::Connected;
    lines.push(Line::from(format!(
        "{} · {}",
        app.snapshot.connection.label(),
        if connected {
            "authoritative LBE provider projection"
        } else {
            "provider projection unavailable"
        }
    )));
    lines.push(Line::from(Span::styled(
        "Provider identity, health, authentication, and model data remain LBE-owned.",
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::from(Span::styled(
        "↑↓ choose provider · Enter validate · Esc close",
        Style::default().fg(PALETTE.amber),
    )));
    lines.push(Line::default());
    if app.snapshot.providers.is_empty() {
        lines.push(Line::from(Span::styled(
            "No provider catalog projected.",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        lines.extend(
            app.snapshot
                .providers
                .iter()
                .enumerate()
                .map(|(index, provider)| {
                    let local = if provider.is_local { " · LOCAL" } else { "" };
                    let marker = if index == app.provider_picker_index {
                        "[>]"
                    } else {
                        "[ ]"
                    };
                    let style = if index == app.provider_picker_index {
                        Style::default()
                            .fg(PALETTE.bg)
                            .bg(PALETTE.amber)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(PALETTE.ink)
                    };
                    Line::from(Span::styled(
                        format!(
                            "{marker} {}  {} · {}{}",
                            provider.provider_id.label(),
                            provider.auth_state.label(),
                            provider.health.label(),
                            local
                        ),
                        style,
                    ))
                }),
        );
    }
    Text::from(lines)
}

fn mcp_panel_text(app: &App) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        "MCP",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(format!(
        "{} · registry schema v{} · metadata-only projection",
        if app.snapshot.connection == RuntimeConnection::Connected {
            "CONNECTED · authoritative LBE MCP projection"
        } else {
            "MCP registry unavailable"
        },
        app.mcp_schema_version
    )));
    lines.push(Line::from(Span::styled(
        "No MCP transport, execution, or authorization state is retained here.",
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::default());
    if app.mcp_integrations.is_empty() {
        lines.push(Line::from(Span::styled(
            "No MCP integrations are registered.",
            Style::default().fg(PALETTE.muted),
        )));
    } else {
        for integration in &app.mcp_integrations {
            lines.push(Line::from(format!(
                "{} · {} · {}",
                integration.integration_id, integration.tool_id, integration.availability
            )));
            lines.push(Line::from(format!(
                "  adapter {} · enabled {} · credential configured {}",
                integration.adapter_id, integration.enabled, integration.credential_ref_configured
            )));
            lines.push(Line::from(format!(
                "  access {} · network {} · risk {} · timeout {}s · retry {}",
                integration.access_class,
                integration.network_behavior,
                integration.risk_class,
                integration.timeout_seconds,
                integration.retry_policy
            )));
            lines.push(Line::from(format!(
                "  {} · {}",
                integration.description, integration.rationale
            )));
        }
    }
    Text::from(lines)
}

fn model_picker_text(app: &App) -> Text<'static> {
    let mut lines = vec![Line::from(Span::styled(
        "Models",
        Style::default()
            .fg(PALETTE.ink)
            .add_modifier(Modifier::BOLD),
    ))];
    lines.push(Line::from(Span::styled(
        "[>] move   [x] selected   [ ] available   Enter apply   Esc close",
        Style::default().fg(PALETTE.faint),
    )));
    lines.push(Line::default());
    if app.snapshot.models.is_empty() {
        lines.push(Line::from(Span::styled(
            "No discovered models are available.",
            Style::default().fg(PALETTE.red),
        )));
    } else {
        for (index, model) in app.snapshot.models.iter().enumerate() {
            let is_cursor = index == app.model_picker_index;
            let is_selected = app
                .snapshot
                .selected_model
                .as_ref()
                .is_some_and(|selected| {
                    selected.provider_id == model.provider_id && selected.model_id == model.model_id
                });
            let icon = if is_cursor {
                "[>]"
            } else if is_selected {
                "[x]"
            } else {
                "[ ]"
            };
            let style = if is_cursor {
                Style::default()
                    .fg(PALETTE.ink)
                    .add_modifier(Modifier::BOLD)
            } else if is_selected {
                Style::default().fg(PALETTE.green)
            } else {
                Style::default().fg(PALETTE.muted)
            };
            lines.push(Line::from(Span::styled(
                format!(
                    "{icon} {}  {} · context {} · output {}",
                    model.provider_id.label(),
                    model.display_name,
                    model
                        .context_window
                        .map_or_else(|| "unknown".to_owned(), |v| v.to_string()),
                    model
                        .max_output_tokens
                        .map_or_else(|| "unknown".to_owned(), |v| v.to_string())
                ),
                style,
            )));
        }
    }
    Text::from(lines)
}

fn capability_marker(enabled: bool) -> &'static str {
    if enabled {
        display_token("●", "[x]", ascii_mode_enabled())
    } else {
        display_token("○", "[ ]", ascii_mode_enabled())
    }
}

fn welcome_text(available_height: u16, app: &App) -> Text<'static> {
    let mut lines = if available_height >= 22 {
        logo_lines(Duration::from_secs(2))
    } else {
        minimal_logo_lines()
    };
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
    let provider = app
        .snapshot
        .selected_model
        .as_ref()
        .map_or("not selected".to_owned(), |model| {
            model.provider_id.label().to_owned()
        });
    let model = app
        .snapshot
        .selected_model
        .as_ref()
        .map_or("not selected".to_owned(), |model| model.model_id.clone());
    lines.push(Line::from(vec![
        Span::styled("Provider  ", Style::default().fg(PALETTE.faint)),
        Span::styled(provider, Style::default().fg(PALETTE.amber)),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Model     ", Style::default().fg(PALETTE.faint)),
        Span::styled(model, Style::default().fg(PALETTE.amber)),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Workspace ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            if app.snapshot.workspace_label.is_empty() {
                "not attached".to_owned()
            } else {
                app.snapshot.workspace_label.clone()
            },
            Style::default().fg(PALETTE.ink),
        ),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Session   ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            app.snapshot
                .session_id
                .as_deref()
                .unwrap_or("not attached")
                .to_owned(),
            Style::default().fg(PALETTE.ink),
        ),
    ]));
    lines.push(Line::from(vec![
        Span::styled("Policy    ", Style::default().fg(PALETTE.faint)),
        Span::styled(
            format!(
                "{} · {}",
                app.snapshot.connection.label(),
                if app.snapshot.connection == RuntimeConnection::Connected {
                    "authorization required for mutation"
                } else {
                    "read-only UI contract"
                }
            ),
            Style::default().fg(app.snapshot.connection.color()),
        ),
    ]));
    if let Some(activity) = app.activity_log.last() {
        lines.push(Line::from(vec![
            Span::styled("Activity  ", Style::default().fg(PALETTE.faint)),
            Span::styled(
                truncate_text(activity, available_height.saturating_sub(12) as usize),
                Style::default().fg(PALETTE.green),
            ),
        ]));
    } else {
        lines.push(Line::from(vec![
            Span::styled("Activity  ", Style::default().fg(PALETTE.faint)),
            Span::styled(
                "idle · waiting for your request",
                Style::default().fg(PALETTE.faint),
            ),
        ]));
    }
    lines.push(Line::from(Span::styled(
        "/provider select provider   /model select model   /help shortcuts",
        Style::default().fg(PALETTE.muted),
    )));
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
            let mut active_style = Style::default().fg(PALETTE.bg);
            for (column, character) in line.chars().enumerate() {
                let visible = elapsed >= OUTER_REVEAL;
                let center_bar =
                    (5..=11).contains(&row) && column == 19 && center_bar_visible(elapsed);
                let (display, style) = if !visible || (character == ' ' && !center_bar) {
                    (' ', Style::default().fg(PALETTE.bg))
                } else if character == '#' {
                    ('█', Style::default().fg(PALETTE.red))
                } else if character == '*' {
                    ('█', logo_cell_style(row, column))
                } else {
                    ('█', Style::default().fg(PALETTE.logo_outer))
                };
                if style != active_style && !segment.is_empty() {
                    spans.push(Span::styled(std::mem::take(&mut segment), active_style));
                    active_style = style;
                }
                segment.push(display);
            }
            if !segment.is_empty() {
                spans.push(Span::styled(segment, active_style));
            }
            Line::from(spans)
        })
        .collect()
}

pub(crate) fn input_cursor_visible(elapsed: Duration) -> bool {
    (elapsed.as_millis() / TYPE_CURSOR_HALF_PERIOD.as_millis()) % 2 == 0
}

fn minimal_logo_lines() -> Vec<Line<'static>> {
    MINIMAL_LOGO
        .iter()
        .map(|line| {
            Line::from(Span::styled(
                (*line).to_owned(),
                Style::default()
                    .fg(PALETTE.red)
                    .add_modifier(Modifier::BOLD),
            ))
        })
        .collect()
}

pub(crate) fn logo_cell_visible(row: usize, column: usize, elapsed: Duration) -> bool {
    let outer =
        row == 0 || row == 16 || ((1..=15).contains(&row) && matches!(column, 0 | 1 | 39 | 40));
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
