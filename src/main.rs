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

use std::{io, time::Instant};

use ratatui::termina::{EventReader, event::Event};

use app::App;
use wrapper::{LbeWrapper, MockLbeWrapper, RealLbeWrapper};

fn main() -> io::Result<()> {
    let (mut terminal, events) = ui::init_terminal()?;

    let result = run(&mut terminal, &events);

    ui::restore_terminal(&mut terminal)?;

    result
}

fn run(terminal: &mut ui::AppTerminal, events: &EventReader) -> io::Result<()> {
    let mut wrapper = build_wrapper();
    let mut app = App::with_snapshot(wrapper.snapshot());

    while !app.should_quit() {
        terminal.draw(|frame| ui::draw(frame, &app))?;

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
                app.handle_key(key, &mut *wrapper, Instant::now());
            }
        }
    }

    Ok(())
}

/// Selects the `LbeWrapper` implementation based on `LBE_RUNTIME`.
///
/// `LBE_RUNTIME=real` selects `RealLbeWrapper`, which targets the wall
/// endpoint from `LBE_WALL_ENDPOINT` and never fabricates runtime state.
/// Any other value (or unset) selects `MockLbeWrapper`.
fn build_wrapper() -> Box<dyn LbeWrapper> {
    match std::env::var("LBE_RUNTIME") {
        Ok(value) if value == "real" => Box::new(RealLbeWrapper::default()),
        _ => Box::new(MockLbeWrapper::default()),
    }
}
