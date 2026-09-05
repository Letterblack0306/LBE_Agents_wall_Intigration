import type { AgentMode, ClineSubscriptionPlan } from "@cline/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { TranscriptCommand } from "../hooks/transcript-keybinds";
import { useTheme } from "../hooks/use-theme";
import { getThemeModeAccent } from "../themes";
import type { ChatEntry } from "../types";
import { ChatEntryView } from "./chat-entry";
import { LetterblackLoader } from "./letterblack-loader";

export interface TranscriptScrollHandle {
	runTranscriptCommand: (command: TranscriptCommand) => void;
}

interface ChatMessageListProps {
	entries: ChatEntry[];
	isStreaming?: boolean;
	loadIndividualSubscriptionPlans?: () => Promise<ClineSubscriptionPlan[]>;
	uiMode?: AgentMode;
}

function ProcessReasoningRow(props: { text: string; streaming: boolean }) {
	const [expanded, setExpanded] = useState(false);
	const lines = props.text.replace(/^\n+/, "").split("\n");
	const visible = expanded ? lines : lines.slice(-3);
	const flat = props.text.replace(/\s+/g, " ").trim();
	const summary = flat.length > 120 ? `...${flat.slice(-117)}` : flat;

	useEffect(() => {
		setExpanded(false);
	}, [props.streaming]);

	if (!props.streaming && !expanded) {
		return (
			<box onMouseDown={() => setExpanded(true)}>
				<text fg="gray" selectable>
					✓ process · {summary || "completed"}
				</text>
			</box>
		);
	}

	return (
		<box flexDirection="column" onMouseDown={() => setExpanded((v) => !v)}>
			<text fg="gray">
				{props.streaming ? "› process · live" : "▼ process"}
			</text>
			<box
				flexDirection="column"
				paddingLeft={2}
				maxHeight={expanded ? undefined : 3}
				overflow={expanded ? undefined : "hidden"}
			>
				{visible.map((line, index) => (
					<text key={`${index}:${line}`} fg="gray" selectable>
						{line || " "}
					</text>
				))}
			</box>
		</box>
	);
}

export const ChatMessageList = forwardRef<
	TranscriptScrollHandle,
	ChatMessageListProps
>(function ChatMessageList(props, ref) {
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);
	const lastEntry = props.entries.at(-1);
	const theme = useTheme();
	const accent = getThemeModeAccent(theme, props.uiMode ?? "act");
	const userSubmissionScrollKey =
		lastEntry?.kind === "user_submitted" ? props.entries.length : 0;

	const runTranscriptCommand = useCallback((command: TranscriptCommand) => {
		const scrollbox = scrollboxRef.current;
		if (!scrollbox) return;
		switch (command) {
			case "messages_page_up":
				scrollbox.scrollBy(-scrollbox.height / 2);
				return;
			case "messages_page_down":
				scrollbox.scrollBy(scrollbox.height / 2);
				return;
			case "messages_half_page_up":
				scrollbox.scrollBy(-scrollbox.height / 4);
				return;
			case "messages_half_page_down":
				scrollbox.scrollBy(scrollbox.height / 4);
				return;
			case "messages_first":
				scrollbox.scrollTo(0);
				return;
			case "messages_last":
				scrollbox.scrollTo(scrollbox.scrollHeight);
				return;
		}
	}, []);

	useImperativeHandle(ref, () => ({ runTranscriptCommand }), [runTranscriptCommand]);

	useEffect(() => {
		if (!userSubmissionScrollKey) return;
		const scrollToBottom = () => {
			const scrollbox = scrollboxRef.current;
			if (!scrollbox) return;
			scrollbox.scrollTo(scrollbox.scrollHeight);
		};
		scrollToBottom();
		queueMicrotask(scrollToBottom);
		const timeout = setTimeout(scrollToBottom, 0);
		return () => clearTimeout(timeout);
	}, [userSubmissionScrollKey]);

	return (
		<scrollbox ref={scrollboxRef} flexGrow={1} stickyScroll stickyStart="bottom">
			<box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
				{props.entries.map((entry, i) => {
					const key = `${i}:${entry.kind}`;
					if (entry.kind === "reasoning") {
						return (
							<ProcessReasoningRow
								key={key}
								text={entry.text}
								streaming={entry.streaming}
							/>
						);
					}
					const entryMode = entry.mode ?? props.uiMode ?? "act";
					return (
						<ChatEntryView
							key={key}
							entry={entry}
							accent={getThemeModeAccent(theme, entryMode)}
							mode={entryMode === "plan" ? "plan" : "act"}
							loadIndividualSubscriptionPlans={
								props.loadIndividualSubscriptionPlans
							}
							theme={theme}
						/>
					);
				})}
				{props.isStreaming && <LetterblackLoader color={accent} />}
			</box>
		</scrollbox>
	);
});
