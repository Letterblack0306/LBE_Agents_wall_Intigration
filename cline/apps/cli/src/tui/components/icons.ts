// ============================================================================
// LBE TUI Icon System - Centralized iconography
// ============================================================================

// STATUS ICONS
export const StatusIcons = {
	enabled: (s = 1) => "●".repeat(s),
	disabled: (s = 1) => "○".repeat(s),
	partial: (s = 1) => "◐".repeat(s),
	loading: (s = 1) => "~".repeat(s),
	error: (s = 1) => "✗".repeat(s),
	success: (s = 1) => "✓".repeat(s),
	warning: (s = 1) => "⚠".repeat(s),
} as const;

// NAVIGATION ICONS
export const NavIcons = {
	home: "⌂", settings: "⚙", help: "?", chevronRight: "‣",
	arrowUp: "▲", arrowDown: "▼", arrowLeft: "◀", arrowRight: "▶",
	navigate: "↑↓",
} as const;

// BRAND ICONS
export const BrandIcons = {
	active: "◆", inactive: "◇", loading: "◌", starFilled: "★", starOutline: "☆",
} as const;

// LOADER FRAMES
export const LoaderFrames = {
	pipe: ["|", "||", "|||", "////", "/////", "////", "//", "/"],
	dots: ["", ".", "..", "..."],
	wave: ["~", "~~", "~~~", "~~~~", "~~~~~"],
	blocks: ["▖", "▘", "▝", "▗"],
	arc: ["◐", "◓", "◑", "◒"],
	pulse: ["●", "○", "◎", "○"],
	square: ["■", "□", "▪", "▫"],
	spinner: ["◢", "◣", "◤", "◥", "◢"],
} as const;

// ACTION ICONS
export const ActionIcons = {
	add: "+", remove: "−", edit: "✎", copy: "⎘", check: "✓", cross: "✗",
	play: "▶", pause: "⏸", stop: "■", refresh: "↻", search: "⌕",
	filter: "⍋", sort: "⍓", menu: "☰", close: "✕",
} as const;

// SEPARATORS
export const Separators = {
	bullet: "•", middleDot: "·", verticalBar: "│", verticalDotted: "┊",
	section: "─", horizontal: "─", vertical: "│", ellipsis: "…",
	bulletSep: " • ", pipeSep: " │ ",
} as const;

// GIT ICONS
export const GitIcons = {
	delta: "Δ", addition: "+", deletion: "−", modified: "~",
	untracked: "?", branch: "⎇", commit: "○", merge: "⊞",
} as const;

// MODE ICONS
export const ModeIcons = {
	plan: "◆", act: "▶", debug: "◉", review: "◎",
} as const;

// COMPOSITE ICONS
export const CompositeIcons = {
	gitDiff: (files: number, add: number, del: number) =>
		`${files}${GitIcons.delta} +${add} -${del}`,
	tokenBar: (used: number, total: number) => {
		const ratio = total > 0 ? used / total : 0;
		const filled = Math.round(ratio * 6);
		return `${"█".repeat(filled)}${".".repeat(6 - filled)} (${used.toLocaleString()})`;
	},
	modeBadge: (mode: "plan" | "act") => `${mode.toUpperCase()} ${ModeIcons[mode]}`,
	enabledStatus: (name: string) => `${StatusIcons.enabled()} ${name}`,
	disabledStatus: (name: string) => `${StatusIcons.disabled()} ${name}`,
	loadingStatus: (text: string) => `${StatusIcons.loading()} ${text}`,
	errorStatus: (msg: string) => `${StatusIcons.error()} ${msg}`,
	successStatus: (msg: string) => `${StatusIcons.success()} ${msg}`,
	navHint: (action: string) => `${NavIcons.navigate} ${action}`,
} as const;

export type IconKey = keyof typeof StatusIcons | keyof typeof NavIcons;