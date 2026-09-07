import type { AgentMode } from "@cline/core";
import { useTerminalDimensions } from "@opentui/react";
import { Spacing, Gap } from "./layout";
import {
	shouldShowCliUsageCost,
	shouldShowCliUsageCoveredBySubscription,
} from "../../utils/usage-cost-display";
import { useTheme } from "../hooks/use-theme";

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
	if (shouldShowCliUsageCoveredBySubscription(providerId)) {
		return "";
	}
	if (!shouldShowCliUsageCost(providerId)) {
		return "";
	}
	return formatCost(totalCost);
}

export function formatStatusBarUsageText(input: {
	totalTokens: number;
	totalCost: number;
	providerId: string;
}): string {
	const tokens = `(${input.totalTokens.toLocaleString()})`;
	const costText = formatCostText(input.providerId, input.totalCost);
	if (!costText) {
		return tokens;
	}
	return `${tokens} ${costText}`;
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
	if (config.providerId === "cline-pass") {
		displayName = `ClinePass: ${displayName}`;
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
	const {
		modelId,
		totalTokens,
		totalCost,
		maxInputTokens,
		uiMode,
		workspaceName,
		gitBranch,
		gitDiffStats,
		onToggleMode,
		variant = "chat",
	} = props;

	const { width } = useTerminalDimensions();
	const theme = useTheme();
	const foreground = theme.defaultForeground;
	const modeAccent = uiMode === "plan" ? theme.accents.plan : theme.accents.act;
	const successColor = theme.accents.success;
	const hasMaxInputTokens =
		typeof maxInputTokens === "number" &&
		Number.isFinite(maxInputTokens) &&
		maxInputTokens > 0;
	const bar = hasMaxInputTokens
		? createContextBar(totalTokens, maxInputTokens, 6)
		: undefined;
	const usageText = formatStatusBarUsageText({
		totalTokens,
		totalCost,
		providerId: props.providerId,
	});
	const modeLabel = uiMode === "plan" ? "PLAN" : "ACT";
	const workspace = workspaceName || "workspace";
	const workspaceLabel = `${workspace}${gitBranch ? `:${gitBranch}` : ""}`;
	const hasGitDiff = Boolean(gitDiffStats && gitDiffStats.files > 0);
	const available = Math.max(24, width - 4);
	const reserve = variant === "home" ? 20 : 28;
	const modelMax = Math.max(12, Math.floor((available - reserve) * 0.55));
	const workspaceMax = Math.max(10, available - modelMax - reserve);
	const truncate = (value: string, max: number) =>
		value.length > max && max > 3 ? `${value.slice(0, max - 3)}...` : value;
	const shownModel = truncate(modelId, modelMax);
	const shownWorkspace = truncate(workspaceLabel, workspaceMax);
	return (
		<box flexDirection="column" paddingX={Spacing.sm}>
			<box flexDirection="row" justifyContent="space-between" gap={Gap.compact}>
				<box flexDirection="row" gap={Gap.compact} onMouseDown={onToggleMode}>
					<text fg={modeAccent}>{modeLabel}</text>
					<text fg="gray">·</text>
					<text fg="gray">{shownModel}</text>
				</box>
				<box flexDirection="row" gap={Gap.compact}>
					{variant === "chat" && bar && (
						<text fg="gray">
							<span fg={resolveContextBarFilledForeground(foreground)}>{bar.filled}</span>{bar.empty}
						</text>
					)}
					{variant === "chat" && totalTokens > 0 && <text fg="gray">{usageText}</text>}
					<text fg="gray">{shownWorkspace}</text>
				</box>
			</box>
			{hasGitDiff && gitDiffStats && (
				<box flexDirection="row" justifyContent="flex-end">
					<text fg="gray">
						{gitDiffStats.files}? <span fg={successColor}>+{gitDiffStats.additions}</span>{" "}
						<span fg={theme.accents.error}>-{gitDiffStats.deletions}</span>
					</text>
				</box>
			)}
		</box>
	);
}