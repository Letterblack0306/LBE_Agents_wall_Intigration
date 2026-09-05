import { useTerminalDimensions } from "@opentui/react";
import {
	AutocompleteDropdown,
	type AutocompleteDropdownProps,
	DROPDOWN_MAX_HEIGHT,
} from "../components/autocomplete-dropdown";
import { InputBar, type TextareaHandle } from "../components/input-bar";
import {
	resolveModelDisplayName,
	resolveModelMaxInputTokens,
	StatusBar,
} from "../components/status-bar";
import { useSession } from "../contexts/session-context";
import { useTheme } from "../hooks/use-theme";
import {
	getInputRuleColor,
	getModeInputForeground,
	getModeInputPlaceholder,
} from "../palette";
import { getThemeModeAccent } from "../themes";
import { HOME_VIEW_MAX_WIDTH, type TuiProps } from "../types";

export function HomeView(props: {
	config: TuiProps["config"];
	inputValue: string;
	inputKey: number;
	onSubmit: () => void;
	onContentChange: (text: string) => void;
	onImagePaste: (dataUrl: string) => string;
	onLargeTextPaste: (text: string) => string;
	onInputFocusRequest?: () => void;
	repoStatus: {
		branch: string | null;
		diffStats: {
			files: number;
			additions: number;
			deletions: number;
		} | null;
	};
	textareaRef?: React.MutableRefObject<TextareaHandle | null>;
	autocomplete?: AutocompleteDropdownProps;
	onToggleMode: () => void;
}) {
	const {
		config,
		inputValue,
		inputKey,
		onSubmit,
		onContentChange,
		onImagePaste,
		onLargeTextPaste,
		repoStatus,
	} = props;
	const session = useSession();
	const { width } = useTerminalDimensions();
	const theme = useTheme();
	const terminalBg = theme.background;
	const accent = getThemeModeAccent(theme, session.uiMode);
	const inputRuleColor = getInputRuleColor(terminalBg);
	const inputForeground = getModeInputForeground(session.uiMode, terminalBg);
	const inputPlaceholder = getModeInputPlaceholder(session.uiMode, terminalBg);
	const modelDisplayName = resolveModelDisplayName(config);
	const maxInputTokens = resolveModelMaxInputTokens(config);
	const hasAutocomplete =
		props.autocomplete?.mode && props.autocomplete.options.length > 0;
	const workspaceName = config.workspaceRoot
		? (config.workspaceRoot.split("/").pop() ?? "")
		: "";
	const modeLabel = session.uiMode === "plan" ? "PLAN" : "AUDIT";

	return (
		<box
			flexDirection="column"
			width="100%"
			height="100%"
			justifyContent="space-between"
		>
			<box
				flexDirection="row"
				justifyContent="space-between"
				paddingX={1}
				flexShrink={0}
			>
				<text>
					<strong>LBE</strong>
					<span fg="gray">
						{" · "}
						{workspaceName || "workspace"}
						{" · "}
						{modelDisplayName}
						{" · "}
					</span>
					<span fg={accent}>{modeLabel}</span>
				</text>
				<text fg="gray">IDLE</text>
			</box>

			<box flexGrow={1} />

			<box flexDirection="column" width="100%" flexShrink={0}>
				{hasAutocomplete && props.autocomplete && (
					<AutocompleteDropdown
						{...props.autocomplete}
						accent={accent}
						containerWidth={Math.min(width, HOME_VIEW_MAX_WIDTH)}
					/>
				)}

				<InputBar
					accent={accent}
					ruleColor={inputRuleColor}
					inputForeground={inputForeground}
					inputPlaceholder={inputPlaceholder}
					placeholder="Message LBE…"
					initialValue={inputValue}
					inputKey={inputKey}
					onSubmit={onSubmit}
					onContentChange={onContentChange}
					onImagePaste={onImagePaste}
					onLargeTextPaste={onLargeTextPaste}
					onFocusRequest={props.onInputFocusRequest}
					textareaRef={props.textareaRef}
				/>

				<box height={hasAutocomplete ? 0 : Math.min(0, DROPDOWN_MAX_HEIGHT)} />
				<StatusBar
					providerId={config.providerId}
					modelId={modelDisplayName}
					totalTokens={session.lastTotalTokens}
					totalCost={session.lastTotalCost}
					maxInputTokens={maxInputTokens}
					uiMode={session.uiMode}
					autoApproveAll={session.autoApproveAll}
					workspaceName={workspaceName}
					gitBranch={repoStatus.branch}
					gitDiffStats={repoStatus.diffStats}
					onToggleMode={props.onToggleMode}
					variant="home"
				/>
			</box>
		</box>
	);
}
