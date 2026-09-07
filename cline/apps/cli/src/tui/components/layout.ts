// ============================================================================
// LBE TUI Layout Alignment System
// Consistent spacing and layout utilities for terminal UI
// ============================================================================

export interface BoxSpacing {
	padding?: number;
	paddingX?: number;
	paddingY?: number;
	margin?: number;
	marginX?: number;
	marginY?: number;
	gap?: number;
}

export interface FlexConfig {
	flexDirection?: "row" | "column";
	alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
	justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
}

// ============================================================================
// STANDARD SPACING
// ============================================================================

export const Spacing = {
	none: 0,
	xs: 0.5,
	sm: 1,
	md: 2,
	lg: 3,
	xl: 4,
	xxl: 6,
} as const;

export const Gap = {
	tight: 0,
	compact: 1,
	normal: 2,
	relaxed: 3,
	loose: 4,
} as const;

// ============================================================================
// LAYOUT PATTERNS
// ============================================================================

export const LayoutPatterns = {
	/** Center everything */
	centered: {
		alignItems: "center",
		justifyContent: "center",
	} as FlexConfig,

	/** Space items apart */
	spaced: {
		alignItems: "center",
		justifyContent: "space-between",
	} as FlexConfig,

	/** Left-aligned, vertically centered */
	leftAligned: {
		alignItems: "center",
		justifyContent: "flex-start",
	} as FlexConfig,

	/** Right-aligned, vertically centered */
	rightAligned: {
		alignItems: "center",
		justifyContent: "flex-end",
	} as FlexConfig,

	/** Stack items vertically */
	stacked: {
		flexDirection: "column",
		alignItems: "stretch",
	} as FlexConfig,

	/** Inline items horizontally */
	inline: {
		flexDirection: "row",
		alignItems: "center",
	} as FlexConfig,

	/** Sidebar layout */
	sidebar: {
		flexDirection: "row",
		alignItems: "stretch",
	} as FlexConfig,

	/** Header layout */
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	} as FlexConfig,

	/** Footer layout */
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
	} as FlexConfig,
} as const;

// ============================================================================
// CONTENT WIDTHS
// ============================================================================

export const ContentWidths = {
	/** Narrow content (forms, inputs) */
	narrow: 40,
	/** Standard content */
	standard: 60,
	/** Wide content (lists, tables) */
	wide: 80,
	/** Full width */
	full: 100,
} as const;

// ============================================================================
// TRUNCATION UTILITIES
// ============================================================================

export function truncateText(text: string, maxLength: number): string {
	if (maxLength <= 3) return text.slice(0, maxLength);
	return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function truncateMiddle(text: string, maxLength: number): string {
	if (maxLength <= 3 || text.length <= maxLength) return text;
	const half = Math.floor((maxLength - 3) / 2);
	return `${text.slice(0, half)}...${text.slice(-half)}`;
}

export function truncateStart(text: string, maxLength: number): string {
	if (maxLength <= 3 || text.length <= maxLength) return text;
	return `...${text.slice(-(maxLength - 3))}`;
}

// ============================================================================
// PADDING HELPERS
// ============================================================================

export function getPaddingStyle(padding: number) {
	return {
		padding,
		paddingX: padding,
		paddingY: padding,
	};
}

export function getVerticalPadding(vertical: number) {
	return {
		paddingY: vertical,
	};
}

export function getHorizontalPadding(horizontal: number) {
	return {
		paddingX: horizontal,
	};
}

// ============================================================================
// FLEX HELPER
// ============================================================================

export function flexRow(
	align: FlexConfig["alignItems"] = "center",
	justify: FlexConfig["justifyContent"] = "flex-start",
	gap?: number,
) {
	return {
		flexDirection: "row" as const,
		alignItems: align,
		justifyContent: justify,
		...(gap !== undefined && { gap }),
	};
}

export function flexColumn(
	align: FlexConfig["alignItems"] = "flex-start",
	justify: FlexConfig["justifyContent"] = "flex-start",
	gap?: number,
) {
	return {
		flexDirection: "column" as const,
		alignItems: align,
		justifyContent: justify,
		...(gap !== undefined && { gap }),
	};
}

// ============================================================================
// SURFACE/CARD PATTERN
// ============================================================================

export const SurfacePatterns = {
	flat: {
		border: false,
	},
	subtle: {
		border: true,
		borderStyle: "single" as const,
		borderColor: "gray",
	},
	elevated: {
		border: true,
		borderStyle: "round" as const,
	},
	inset: {
		border: true,
		borderStyle: "single" as const,
		borderColor: "gray",
		padding: 1,
	},
} as const;

// ============================================================================
// TYPOGRAPHY SCALE
// ============================================================================

export const TypographyScale = {
	caption: { size: 0.8, color: "gray" },
	body: { size: 1, color: "default" },
	label: { size: 0.9, color: "default" },
	heading: { size: 1.2, color: "default" },
	large: { size: 1.4, color: "default" },
} as const;