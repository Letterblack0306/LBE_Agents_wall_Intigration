import type { AgentMode } from "@cline/core";
import { useTerminalDimensions } from "@opentui/react";
import {
	shouldShowCliUsageCost,
	shouldShowCliUsageCoveredBySubscription,
} from "../../utils/usage-cost-display";

export function createContextBar(
	used: number,
	total?: number,
	width = 6,
): { filled: string; empty: string } {
	const normalizedWidth = Math.max(0, Math.floor(width));
	const ratio = total && total > 0 ? Math.min(used / total, 1) : 0;
	const filledCount =
		total && total > 0 && used > 0
			? used >= total
				? normalizedWidth
				: Math.min(
						Math.max(1, Math.ceil(ratio * normalizedWidth)),
						Math.max(0, normalizedWidth - 1),
					)
			: 0;
	const emptyCount = Math.max(0, normalizedWidth - filledCount);
	return {
		filled: "|".repeat(filledCount),
		empty: ".".repeat(emptyCount),
	};
}

export function resolveContextBarFilledForeground(
	defaultForeground: string | undefined,
): string {
	return defaultForeground ?? "#ffffff";
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(2)}`;
}

function formatCostText(providerId: string, totalCost: number): string {
	if (shouldShowCliUsageCoveredBySubscription(providerId)) return "";
	if (!shouldShowCliUsageCost(providerId)) return "";
	return formatCost(totalCost);
}

export function formatStatusBarUsageText(input: {
	totalTokens: number;
	totalCost: number;
	providerId: string;
}): string {
	const tokens = input.totalTokens.toLocaleString();
	const costText = formatCostText(input.providerId, input.totalCost);
	return costText ? `${tokens} · ${costText}` : tokens;
}

function lookupModelInfo(
	modelId: string,
	knownModels?: Record<string, unknown>,
): { name?: string } | undefined {
	if (!knownModels) return undefined;
	const candidates = [modelId, modelId.split("/").pop()];
	for (const key of candidates) {
		if (!key) continue;
		const hit = knownModels[key] as { name?: string } | undefined;
		if (hit) return hit;
	}
	return undefined;
}

export function resolveModelDisplayName(config: {
	providerId?: string;
	modelId: string;
	knownModels?: Record<string, unknown>;
	thinking?: boolean;
	reasoningEffort?: string;
}): string {
	const info = lookupModelInfo(config.modelId, config.knownModels);
	const modelIdTail = config.modelId.split("/").pop() ?? config.modelId;
	let displayName = info?.name ?? modelIdTail;
	if (config.thinking && config.reasoningEffort) {
		displayName = `${displayName} (${config.reasoningEffort})`;
	}
	return displayName;
}

export function resolveModelMaxInputTokens(config: {
	modelId: string;
	knownModels?: Record<string, unknown>;
}): number | undefined {
	const info = (lookupModelInfo(config.modelId, config.knownModels) ?? {}) as {
		maxInputTokens?: number;
		contextWindow?: number;
	};
	if (typeof info.maxInputTokens === "number" && info.maxInputTokens > 0) {
		return info.maxInputTokens;
	}
	if (typeof info.contextWindow === "number" && info.contextWindow > 0) {
		return info.contextWindow;
	}
	return undefined;
}

export interface StatusBarProps {
	providerId: string;
	modelId: string;
	totalTokens: number;
	totalCost: number;
	maxInputTokens?: number;
	uiMode: AgentMode;
	autoApproveAll: boolean;
	workspaceName: string;
	gitBranch: string | null;
	gitDiffStats: {
		files: number;
		additions: number;
		deletions: number;
	} | null;
	onToggleMode?: () => void;
	variant?: "home" | "chat";
}

export function StatusBar(props: StatusBarProps) {
	const { totalTokens, totalCost, maxInputTokens, uiMode, onToggleMode } = props;
	const { width } = useTerminalDimensions();
	const hasMaxInputTokens =
		typeof maxInputTokens === "number" &&
		Number.isFinite(maxInputTokens) &&
		maxInputTokens > 0;
	const contextPercent = hasMaxInputTokens
		? Math.min(100, Math.round((totalTokens / maxInputTokens) * 100))
		: null;
	const usage = formatStatusBarUsageText({
		totalTokens,
		totalCost,
		providerId: props.providerId,
	});
	const mode = uiMode === "plan" ? "PLAN" : "AUDIT";
	const left = contextPercent === null
		? `ctx ${usage} · ${mode}`
		: `ctx ${contextPercent}% · ${mode}`;
	const right = "Ctrl+K";
	const maxLeft = Math.max(8, width - right.length - 4);
	const clipped = left.length > maxLeft
		? `${left.slice(0, Math.max(1, maxLeft - 3))}...`
		: left;

	return (
		<box
			flexDirection="row"
			justifyContent="space-between"
			paddingX={1}
			flexShrink={0}
			border={["top"]}
			borderStyle="single"
			borderColor="gray"
		>
			<text fg="gray">{clipped}</text>
			<text fg="gray" onMouseDown={onToggleMode}>{right}</text>
		</box>
	);
}
