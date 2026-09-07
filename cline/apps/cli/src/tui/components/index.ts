// ============================================================================
// LBE TUI Component Exports
// ============================================================================

// Animation Components
export {
	LetterblackLoader,
	TypewriterLoader,
	ProgressBarLoader,
	SpinningIndicator,
	PulsingDot,
	AnimatedDots,
	type LoaderStyle,
} from "./letterblack-loader";

export { LetterblackLogo, type AnimatedLetterblackLogoProps } from "./letterblack-logo";

// Toast Components
export { Toast, ToastStack, type ToastVariant, type ToastState } from "./toast";

// Icon System
export {
	StatusIcons,
	NavIcons,
	BrandIcons,
	ActionIcons,
	GitIcons,
	ModeIcons,
	LoaderFrames,
	Separators,
	CompositeIcons,
	type IconKey,
} from "./icons";

// Layout Utilities
export {
	Spacing,
	Gap,
	LayoutPatterns,
	ContentWidths,
	TypographyScale,
	SurfacePatterns,
	flexRow,
	flexColumn,
	truncateText,
	truncateMiddle,
	truncateStart,
	getPaddingStyle,
	getVerticalPadding,
	getHorizontalPadding,
	type BoxSpacing,
	type FlexConfig,
} from "./layout";

// Re-export common components
export { ChatMessageList, type TranscriptScrollHandle } from "./chat-message-list";
export { InlineToolResponse } from "./inline-tool-response";
export { StatusBar, resolveModelDisplayName, resolveModelMaxInputTokens } from "./status-bar";
export { AutocompleteDropdown, DROPDOWN_MAX_HEIGHT, type AutocompleteDropdownProps } from "./autocomplete-dropdown";
export { InputBar, type TextareaHandle } from "./input-bar";
export { ToolOutput } from "./tool-output";
export { TrackedRobot, useMouseTracker } from "./tracked-robot";
export { QueuedPrompts } from "./queued-prompts";