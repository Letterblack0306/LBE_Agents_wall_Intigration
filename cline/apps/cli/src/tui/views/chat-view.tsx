import {
	AutocompleteDropdown,
	type AutocompleteDropdownProps,
} from "../components/autocomplete-dropdown";
import {
	ChatMessageList,
	type TranscriptScrollHandle,
} from "../components/chat-message-list";
import { InlineToolResponse } from "../components/inline-tool-response";
import { InputBar, type TextareaHandle } from "../components/input-bar";
import { QueuedPrompts } from "../components/queued-prompts";
import {
	createContextBar,
	resolveModelDisplayName,
	resolveModelMaxInputTokens,
	StatusBar,
} from "../components/status-bar";
import { useSession } from "../contexts/session-context";
import { useTheme } from "../hooks/use-theme";
import {
	getInputRuleColor,
	getModeInputBackground,
	getModeInputForeground,
	getModeInputPlaceholder,
} from "../palette";
import { getThemeModeAccent } from "../themes";
import type {
	QueuedPromptItem,
	RuntimeToolInteraction,
	TuiProps,
} from "../types";

export function ChatView(props: {
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
	transcriptScrollRef?: React.Ref<TranscriptScrollHandle>;
	loadIndividualSubscriptionPlans?: TuiProps["loadIndividualSubscriptionPlans"];
	autocomplete?: AutocompleteDropdownProps;
	queuedPrompts?: QueuedPromptItem[];
	selectedQueuedPromptId?: string | null;
	editingQueuedPrompt?: QueuedPromptItem;
	onQueuedPromptEditConfirm: (id: string, prompt: string) => void;
	onToggleMode: () => void;
	runtimeInteraction?: RuntimeToolInteraction | null;
	onResolveToolApproval: (id: number, approved: boolean) => void;
	onResolveAskQuestion: (id: number, answer: string | null) => void;
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
	const theme = useTheme();
	const terminalBg = theme.background;
	const accent = getThemeModeAccent(theme, session.uiMode);
	const inputBackground = getModeInputBackground(session.uiMode, terminalBg);
	const inputRuleColor = getInputRuleColor(terminalBg);
	const inputForeground = getModeInputForeground(session.uiMode, terminalBg);
	const inputPlaceholder = getModeInputPlaceholder(session.uiMode, terminalBg);
	const modelDisplayName = resolveModelDisplayName(config);
	const maxInputTokens = resolveModelMaxInputTokens(config);
	const runtimeInteraction = props.runtimeInteraction ?? null;
	const workspaceName = config.workspaceRoot
		? (config.workspaceRoot.split("/").pop() ?? "")
		: "";
	const modeLabel = session.uiMode === "plan" ? "PLAN" : "AUDIT";
	const stateLabel = session.isRunning ? "RUNNING" : "IDLE";
	const stateColor = session.isRunning ? accent : "gray";
	const contextBar = createContextBar(session.lastTotalTokens, maxInputTokens, 12);
	const gitText = [
		repoStatus.branch ? `git ${repoStatus.branch}` : "",
		repoStatus.diffStats && repoStatus.diffStats.files > 0
			? `${repoStatus.diffStats.files}f +${repoStatus.diffStats.additions} -${repoStatus.diffStats.deletions}`
			: "",
	].filter(Boolean).join(" · ");

	return (
		<box flexDirection="column" width="100%" height="100%">
			<box flexDirection="column" paddingX={1} flexShrink={0}>
				<box flexDirection="row" justifyContent="space-between">
					<text>
						<strong>LBE</strong>
						{" · "}
						<strong>{workspaceName || "workspace"}</strong>
						<span fg="gray">
							{" · "}{modelDisplayName}{" · "}{modeLabel}
						</span>
					</text>
					<text fg="gray">{gitText}</text>
				</box>
				<box flexDirection="row" justifyContent="space-between">
					<text fg={stateColor}>{stateLabel}</text>
					<text fg="gray">ctx [{" "}{contextBar.filled}{contextBar.empty}{" "}]</text>
				</box>
			</box>

			<ChatMessageList
				ref={props.transcriptScrollRef}
				entries={session.entries}
				isStreaming={session.isStreaming}
				loadIndividualSubscriptionPlans={props.loadIndividualSubscriptionPlans}
				uiMode={session.uiMode}
			/>

			<box flexDirection="column" flexShrink={0}>
				{runtimeInteraction && (
					<InlineToolResponse
						key={runtimeInteraction.id}
						interaction={runtimeInteraction}
						accent={accent}
						inputBackground={inputBackground}
						inputForeground={inputForeground}
						inputPlaceholder={inputPlaceholder}
						onResolveToolApproval={props.onResolveToolApproval}
						onResolveAskQuestion={props.onResolveAskQuestion}
					/>
				)}

				{!runtimeInteraction && (
					<>
						{props.autocomplete && (
							<AutocompleteDropdown {...props.autocomplete} accent={accent} />
						)}

						{props.queuedPrompts && props.queuedPrompts.length > 0 && (
							<QueuedPrompts
								items={props.queuedPrompts}
								selectedId={props.selectedQueuedPromptId ?? null}
								editingId={props.editingQueuedPrompt?.id ?? null}
								onEditConfirm={props.onQueuedPromptEditConfirm}
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
							isRunning={session.isRunning}
						/>
					</>
				)}

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
					variant="chat"
				/>
			</box>
		</box>
	);
}
