import { afterEach, describe, expect, it } from "vitest";
import {
	childAgentGovernedToolSurface,
	createGovernedChildSpawnTool,
	clientToolNameForLbeTool,
	LBE_CLIENT_TOOL_NAMES,
	runGovernedChildAgent,
	type ChildAgentDeps,
} from "./lbe-tool-adapter";

function recordingDeps(overrides: {
	createPayload?: Record<string, unknown>;
	contextPayload?: Record<string, unknown>;
	executeChild?: ChildAgentDeps["executeChild"];
	resultPayload?: Record<string, unknown>;
	toolPayload?: Record<string, unknown>;
}) {
	const calls: Array<{ subtool: string; args: string[] }> = [];
	const deps: ChildAgentDeps = {
		runLbe: async (args) => {
			if (args.includes("context")) {
				calls.push({ subtool: "context", args });
				return (
					overrides.contextPayload ?? {
						ok: true,
						parent_session_id: "parent",
						parent_turn_id: "turn-1",
						project_workspace_id: "w1",
						canonical_workspace_root: "C:\\tmp",
						child_session_prefix: "child",
					}
				);
			}
			if (args.includes("session") && args.includes("create")) {
				calls.push({ subtool: "session.create", args });
				return { ok: true };
			}
			const subtool =
				args.find((arg) =>
					["create", "started", "complete", "failed", "cancel", "result", "tool"].includes(arg),
				) ?? "";
			calls.push({ subtool, args });
			if (subtool === "create") {
				const payload = overrides.createPayload ?? { child_run_id: "child-1" };
				return { ...payload, spawn_operation_id: "op" } as Record<string, unknown>;
			}
			if (subtool === "result") {
				return (
					overrides.resultPayload ?? {
						ok: true,
						child_run_id: "child-1",
						status: "completed",
					}
				);
			}
			if (subtool === "tool") {
				return (
					overrides.toolPayload ?? {
						ok: true,
						operation_id: "op-tool-1",
						tool_id: "workspace.read",
						status: "ok",
						receipt_id: "receipt-1",
						output: { content: "tool-output" },
					}
				);
			}
			return { ok: true, receipt: subtool };
		},
		now: () => "2026-09-05T00:00:00Z",
		randomId: () => "rand",
		executeChild: overrides.executeChild,
	};
	return { deps, calls };
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

describe("LBE Cline tool-name mapping", () => {
	it("maps every exposed canonical tool to its registered Cline name", () => {
		expect(LBE_CLIENT_TOOL_NAMES).toEqual({
			"workspace.read": "workspace_read",
			"workspace.list": "workspace_list",
			"workspace.glob": "workspace_glob",
			"workspace.search": "workspace_search",
			"workspace.patch": "workspace_patch",
		});
	});

	it("fails closed for an unknown canonical tool", () => {
		expect(() => clientToolNameForLbeTool("workspace.unknown")).toThrow(
			"Unknown LBE tool mapping: workspace.unknown",
		);
	});
});

describe("governed child agent spawn admission", () => {
	it("creates the LBE ChildAgentRun first, then started, then terminalizes", async () => {
		const { deps, calls } = recordingDeps({});
		const outcome = await runGovernedChildAgent({ task: "do work" }, deps);
		expect(outcome.status).toBe("COMPLETED");
		expect(outcome.child_run_id).toBe("child-1");
		expect(calls.map((call) => call.subtool)).toEqual(["context", "session.create", "create", "started", "complete"]);
		expect(calls[2].args).toContain("--spawn-operation-id");
		expect(calls[2].args.join(" ")).toContain("child-spawn-");
		expect(calls[3].args).toContain("--child-id");
		expect(calls[3].args).toContain("child-1");
	});

	it("denies the spawn when LBE refuses to create the ChildAgentRun", async () => {
		const { deps, calls } = recordingDeps({
			createPayload: { ok: false, message: "not authorized" },
		});
		const outcome = await runGovernedChildAgent({ task: "do work" }, deps);
		expect(outcome.status).toBe("DENIED");
		expect(calls.map((call) => call.subtool)).toEqual(["context", "session.create", "create"]);
	});

	it("denies the spawn when LBE returns no canonical child id", async () => {
		const { deps, calls } = recordingDeps({ createPayload: {} });
		const outcome = await runGovernedChildAgent({ task: "do work" }, deps);
		expect(outcome.status).toBe("DENIED");
		expect(calls).toHaveLength(3);
	});

	it("propagates failure terminalization through LBE when child work throws", async () => {
		const { deps, calls } = recordingDeps({
			executeChild: async () => {
				throw new Error("child work failed");
			},
		});
		const outcome = await runGovernedChildAgent({ task: "do work" }, deps);
		expect(outcome.status).toBe("FAILED");
		expect(calls.map((call) => call.subtool)).toEqual(["context", "session.create", "create", "started", "failed"]);
	});

	it("routes live cancellation through LBE", async () => {
		const controller = new AbortController();
		controller.abort();
		const { deps, calls } = recordingDeps({
			executeChild: async () => ({ status: "COMPLETED" }),
		});
		const outcome = await runGovernedChildAgent(
			{ task: "do work" },
			deps,
			controller.signal,
		);
		expect(outcome.status).toBe("CANCELLED");
		expect(calls.map((call) => call.subtool)).toEqual(["context", "session.create", "create", "started", "cancel"]);
	});
});

describe("governed child spawn tool", () => {
	function spawnTestSetup(overrides: {
		createPayload?: Record<string, unknown>;
		spawnResult?: { text: string; iterations: number; finishReason: string };
		spawnError?: Error;
	}) {
		const { deps, calls } = recordingDeps(overrides);
		let spawnCalls = 0;
		let receivedTools: unknown[] = [];
		const tool = createGovernedChildSpawnTool(
			{
				configProvider: {
					providerId: "p",
					modelId: "m",
					apiKey: "k",
				},
				createSpawnToolOverride: (tools) => {
					receivedTools = tools;
					return {
						execute: async () => {
							spawnCalls += 1;
							if (overrides.spawnError) throw overrides.spawnError;
							return overrides.spawnResult ?? {
								text: "done",
								iterations: 1,
								finishReason: "stop",
							};
						},
					};
				},
			},
			deps,
		);
		return { tool, calls, getSpawnCalls: () => spawnCalls, getTools: () => receivedTools };
	}

	it("is not created when the LBE runtime is not real", () => {
		process.env.LBE_RUNTIME = "mock";
		const { deps } = recordingDeps({});
		expect(
			createGovernedChildSpawnTool(
				{ configProvider: { providerId: "p", modelId: "m", apiKey: "k" } },
				deps,
			),
		).toBeNull();
	});

	it("is not created when recursive spawn is not authorized and depth budget is zero", () => {
		process.env.LBE_RUNTIME = "real";
		process.env.LBE_CHILD_AGENT_MAX_DEPTH = "0";
		delete process.env.LBE_ALLOW_RECURSIVE_SPAWN;
		const { deps } = recordingDeps({});
		expect(
			createGovernedChildSpawnTool(
				{ configProvider: { providerId: "p", modelId: "m", apiKey: "k" } },
				deps,
			),
		).toBeNull();
	});

	it("denies admission without creating any delegated child", async () => {
		process.env.LBE_RUNTIME = "real";
		const setup = spawnTestSetup({
			createPayload: { ok: false, message: "not authorized" },
		});
		const outcome = (await setup.tool!.execute(
			{ task: "do work" },
			{ agentId: "parent-agent", iteration: 0, toolCallId: "tc-1" },
		)) as Record<string, unknown>;
		const lbe = outcome.lbe as Record<string, unknown>;
		expect(lbe.status).toBe("DENIED");
		expect(setup.getSpawnCalls()).toBe(0);
		expect(setup.calls.map((c) => c.subtool)).toEqual(["context", "session.create", "create"]);
	});

		it("runs the delegated child after admission with LBE-governed tools only", async () => {
		process.env.LBE_RUNTIME = "real";
		const setup = spawnTestSetup({});
		const outcome = (await setup.tool!.execute(
			{ task: "do work" },
			{ agentId: "parent-agent", iteration: 0, toolCallId: "tc-1" },
		)) as Record<string, unknown>;
		expect(setup.getSpawnCalls()).toBe(1);
		const names = (setup.getTools() as Array<{ name?: string }>).map(
			(tool) => tool.name ?? "",
		);
		expect(names).toEqual([
			"workspace_read",
			"workspace_list",
			"workspace_glob",
			"workspace_search",
			"workspace_patch",
		]);
		expect(setup.calls.map((c) => c.subtool)).toEqual([
			"context", "session.create", "create", "started", "complete", "result",
		]);
		// Parent continuation: the outcome carries authoritative LBE truth,
		// not the ephemeral delegated-agent text ("done").
		expect(outcome.text).toContain("terminalized in LBE as COMPLETED");
		expect(outcome.finishReason).toBe("stop");
		const lbe = outcome.lbe as Record<string, unknown>;
		expect(lbe.status).toBe("COMPLETED");
		const correlation = outcome.correlation as Record<string, unknown>;
		expect(correlation.child_run_id).toBe("child-1");
				expect(correlation.spawn_operation_id).toBe("op");
	});


		it("maps delegated failure to child_agent.failed through LBE", async () => {
		process.env.LBE_RUNTIME = "real";
		const setup = spawnTestSetup({
			spawnError: new Error("delegated run failed"),
		});
		const outcome = (await setup.tool!.execute(
			{ task: "do work" },
			{ agentId: "parent-agent", iteration: 0, toolCallId: "tc-1" },
		)) as Record<string, unknown>;
		expect(setup.calls.map((c) => c.subtool)).toEqual([
			"context", "session.create", "create", "started", "failed", "result",
		]);
		expect(outcome.text).toContain("terminalized in LBE as FAILED");
		expect(outcome.finishReason).toBe("error");
		const lbe = outcome.lbe as Record<string, unknown>;
		expect(lbe.status).toBe("FAILED");
	});

	it("maps abort to child_agent.cancel with no later completed event", async () => {
		process.env.LBE_RUNTIME = "real";
		const { deps, calls } = recordingDeps({});
		const controller = new AbortController();
		const tool = createGovernedChildSpawnTool(
			{
				configProvider: { providerId: "p", modelId: "m", apiKey: "k" },
				createSpawnToolOverride: () => ({
					execute: async () => {
						controller.abort();
						return { text: "partial", iterations: 1, finishReason: "aborted" };
					},
				}),
			},
			deps,
		);
		const outcome = (await tool!.execute(
			{ task: "do work" },
			{ agentId: "parent-agent", iteration: 0, toolCallId: "tc-1", signal: controller.signal },
		)) as Record<string, unknown>;
				expect(calls.map((c) => c.subtool)).toEqual([
			"context", "session.create", "create", "started", "cancel", "result",
		]);
		expect(outcome.text).toContain("terminalized in LBE as CANCELLED");
		expect(outcome.finishReason).toBe("error");
		const lbe = outcome.lbe as Record<string, unknown>;
		expect(lbe.status).toBe("CANCELLED");
		expect(calls).not.toContainEqual(
			expect.objectContaining({ subtool: "complete" }),
		);
	});

		it("derives the child tool surface only from LBE-governed proxies", () => {
		process.env.LBE_RUNTIME = "mock";
		expect(childAgentGovernedToolSurface()).toEqual([]);
	});

	it("surfaces deep tool-receipt correlation to the parent on completion", async () => {
		process.env.LBE_RUNTIME = "real";
		const { deps, calls } = recordingDeps({});
		let receivedTools: unknown[] = [];
		const tool = createGovernedChildSpawnTool(
			{
				configProvider: { providerId: "p", modelId: "m", apiKey: "k" },
				createSpawnToolOverride: (tools) => {
					receivedTools = tools;
					return {
						execute: async () => {
							// Child calls a governed tool — its receipt is captured.
							await (receivedTools[0] as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute(
								{ path: "README.md" },
								{ toolCallId: "tool-tc-1" },
							);
							return { text: "child-delegated-summary", iterations: 1, finishReason: "stop" };
						},
					};
				},
			},
			deps,
		);
		const outcome = (await tool!.execute(
			{ task: "read the README" },
			{ agentId: "parent-agent", iteration: 0, toolCallId: "tc-1" },
		)) as Record<string, unknown>;
		// The parent continuation carries LBE-owned correlation IDs, not the
		// ephemeral delegated summary text.
		expect(outcome.text).toContain("terminalized in LBE as COMPLETED");
		expect(outcome.text).toContain("tool_receipt_id=receipt-1");
		expect(outcome.text).toContain("runtime_operation_id=op-tool-1");
		const correlation = outcome.correlation as Record<string, unknown>;
		expect(correlation.child_run_id).toBe("child-1");
		expect(correlation.spawn_operation_id).toBe("op");
		expect(correlation.runtime_operation_id).toBe("op-tool-1");
		expect(correlation.tool_receipt_id).toBe("receipt-1");
		// The tool call sequence includes the governed tool invocation + result read-back.
		expect(calls.map((c) => c.subtool)).toEqual([
						"context", "session.create", "create", "started", "tool", "complete", "result",
		]);
	});
});








