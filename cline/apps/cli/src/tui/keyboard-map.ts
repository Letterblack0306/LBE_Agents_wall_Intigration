export type KeyboardAction =
	| "open_settings"
	| "change_model"
	| "change_provider"
	| "change_theme"
	| "manage_mcp"
	| "manage_plugins"
	| "open_account"
	| "compact_context"
	| "browse_skills"
	| "fork_session"
	| "restore_checkpoint"
	| "start_new_session"
	| "open_history"
	| "open_help"
	| "exit_cli";

export type KeyboardShortcut = {
	name: string;
	meta?: boolean;
	option?: boolean;
	ctrl?: boolean;
	shift?: boolean;
};

export type KeyLike = {
	name: string;
	meta?: boolean;
	option?: boolean;
	ctrl?: boolean;
	shift?: boolean;
};

export const COMMAND_PALETTE_SHORTCUTS: Readonly<
	Record<KeyboardAction, { label: string; display: string; shortcut: KeyboardShortcut }>
> = {
	open_settings: { label: "Open Settings", display: "Opt+S", shortcut: { name: "s", option: true } },
	change_model: { label: "Change Model", display: "Opt+M", shortcut: { name: "m", option: true } },
	change_provider: { label: "Change Provider", display: "Opt+P", shortcut: { name: "p", option: true } },
	change_theme: { label: "Change Theme", display: "Opt+T", shortcut: { name: "t", option: true } },
	manage_mcp: { label: "Manage MCP Servers", display: "Opt+C", shortcut: { name: "c", option: true } },
	manage_plugins: { label: "Manage Plugins", display: "Opt+G", shortcut: { name: "g", option: true } },
	open_account: { label: "Open Account", display: "Opt+A", shortcut: { name: "a", option: true } },
	compact_context: { label: "Compact Context", display: "Opt+X", shortcut: { name: "x", option: true } },
	browse_skills: { label: "Browse Skills", display: "Opt+W", shortcut: { name: "w", option: true } },
	fork_session: { label: "Create Session Fork", display: "Opt+R", shortcut: { name: "r", option: true } },
	restore_checkpoint: { label: "Restore Checkpoint", display: "Opt+U", shortcut: { name: "u", option: true } },
	start_new_session: { label: "Start New Session", display: "Opt+L", shortcut: { name: "l", option: true } },
	open_history: { label: "Session History", display: "Opt+H", shortcut: { name: "h", option: true } },
	open_help: { label: "Open Help", display: "Opt+K", shortcut: { name: "k", option: true } },
	exit_cli: { label: "Exit LBE", display: "Opt+Q", shortcut: { name: "q", option: true } },
};

export const CORE_KEY_LABELS = {
	submit: "Enter",
	newline: "Shift+Enter",
	toggle_mode: "Tab",
	toggle_auto_approve: "Shift+Tab",
	copy: "Cmd/Ctrl+C",
	exit: "Cmd/Ctrl+Q",
	interrupt: "Ctrl+I",
	cancel: "Ctrl+X",
	clear_conversation: "Ctrl+L",
	steer: "Ctrl+S",
	command_palette: "Ctrl+K",
	help: "Opt+K",
	dismiss_or_abort: "Escape",
	restore_checkpoint: "Esc Esc",
	history: "Up/Down",
	transcript_page: "PgUp/PgDn",
	transcript_page_alt: "Ctrl+Alt+B/F",
	transcript_half_page: "Ctrl+Alt+U/D",
	transcript_bounds: "Ctrl+G/Ctrl+Alt+G",
} as const;

export function isCopyShortcut(key: KeyLike): boolean {
	return key.name.toLowerCase() === "c" && (!!key.ctrl || !!key.meta);
}

export function isQuitShortcut(key: KeyLike): boolean {
	return key.name.toLowerCase() === "q" && (!!key.ctrl || !!key.meta);
}

export function matchesKeyboardShortcut(
	key: KeyLike,
	shortcut: KeyboardShortcut,
): boolean {
	const modifierMatches = shortcut.option
		? key.option === true || key.meta === true
		: !!key.option === !!shortcut.option && !!key.meta === !!shortcut.meta;
	return (
		key.name.toLowerCase() === shortcut.name.toLowerCase() &&
		modifierMatches &&
		(shortcut.option || !!key.meta === !!shortcut.meta) &&
		!!key.ctrl === !!shortcut.ctrl &&
		!!key.shift === !!shortcut.shift
	);
}