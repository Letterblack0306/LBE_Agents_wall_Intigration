import { useTerminalDimensions } from "@opentui/react";
import { BrandIcons, NavIcons, StatusIcons } from "../components/icons";
import {
	AutocompleteDropdown,
	type AutocompleteDropdownProps,
	DROPDOWN_MAX_HEIGHT,
} from "../components/autocomplete-dropdown";
import { InputBar, type TextareaHandle } from "../components/input-bar";
import { LetterblackLogo } from "../components/letterblack-logo";
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
	const surfaceWidth = Math.max(32, Math.min(width - 4, HOME_VIEW_MAX_WIDTH));
	const railColor = theme.defaultForeground ?? "#d8dce2";

	return (
		<box flexDirection="row" width="100%" height="100%">
			<box
				flexDirection="column"
				width={5}
				paddingY={1}
				alignItems="center"
				justifyContent="space-between"
				border={['right']}
				borderStyle="single"
				borderColor="gray"
			>
				<box flexDirection="column" gap={2} alignItems="center">
					<text fg={accent}>{BrandIcons.active}</text>
					<text fg={railColor}>{NavIcons.home}</text>
					<text fg="gray">{StatusIcons.partial()}</text>
				</box>
				<box flexDirection="column" gap={1} alignItems="center">
					<text fg="gray">{NavIcons.help}</text>
					<text fg="gray">{NavIcons.settings}</text>
				</box>
			</box>
			<box
				flexDirection="column"
				width="100%"
				height="100%"
				alignItems="center"
				justifyContent="center"
				paddingX={2}
			>
				<box flexDirection="column" width={surfaceWidth}>
					<LetterblackLogo />

					<box marginTop={2}>
						<InputBar
							accent={accent}
							ruleColor={inputRuleColor}
							inputForeground={inputForeground}
							inputPlaceholder={inputPlaceholder}
							placeholder="Describe the work. LBE will hold the boundary."
							initialValue={inputValue}
							inputKey={inputKey}
							onSubmit={onSubmit}
							onContentChange={onContentChange}
							onImagePaste={onImagePaste}
							onLargeTextPaste={onLargeTextPaste}
							onFocusRequest={props.onInputFocusRequest}
							textareaRef={props.textareaRef}
						/>
					</box>

					<box flexDirection="column" height={DROPDOWN_MAX_HEIGHT + 1}>
						{hasAutocomplete && props.autocomplete ? (
							<AutocompleteDropdown
								{...props.autocomplete}
								accent={accent}
								containerWidth={surfaceWidth}
							/>
						) : (
							<box marginTop={1}>
								<StatusBar
									providerId={config.providerId}
									modelId={modelDisplayName}
									totalTokens={session.lastTotalTokens}
									totalCost={session.lastTotalCost}
									maxInputTokens={maxInputTokens}
									uiMode={session.uiMode}
									autoApproveAll={session.autoApproveAll}
									workspaceName={
										config.workspaceRoot
											? (config.workspaceRoot.split("/").pop() ?? "")
											: ""
									}
									gitBranch={repoStatus.branch}
									gitDiffStats={repoStatus.diffStats}
									onToggleMode={props.onToggleMode}
									variant="home"
								/>
							</box>
						)}
					</box>
				</box>
			</box>
		</box>
	);
}
