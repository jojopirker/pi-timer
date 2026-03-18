import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const TICK_INTERVAL_MS = 1000;
const AUTO_COMPACT_LABEL = " (auto)";

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	}

	if (minutes > 0) {
		return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	}

	return `${seconds}s`;
}

function formatPwd(ctx: ExtensionContext, branch: string | null): string {
	let pwd = process.cwd();
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) {
		pwd = `~${pwd.slice(home.length)}`;
	}

	if (branch) {
		pwd = `${pwd} (${branch})`;
	}

	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) {
		pwd = `${pwd} • ${sessionName}`;
	}

	return pwd;
}

export default function (pi: ExtensionAPI) {
	let interval: ReturnType<typeof setInterval> | null = null;
	let runStartedAt: number | null = null;
	let lastElapsedMs = 0;
	let requestRender: (() => void) | null = null;
	let currentModel: Model<any> | undefined;
	let usingSubscription = false;

	function triggerRender() {
		requestRender?.();
	}

	function stopTicker() {
		if (!interval) return;
		clearInterval(interval);
		interval = null;
	}

	function resetRun() {
		stopTicker();
		runStartedAt = null;
		lastElapsedMs = 0;
		triggerRender();
	}

	function syncModelState(ctx: ExtensionContext) {
		currentModel = ctx.model;
		usingSubscription = currentModel ? ctx.modelRegistry.isUsingOAuth(currentModel) : false;
	}

	function installFooter(ctx: ExtensionContext) {
		syncModelState(ctx);

		ctx.ui.setFooter((tui, theme, footerData) => {
			const localRequestRender = () => tui.requestRender();
			requestRender = localRequestRender;
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() {
					if (requestRender === localRequestRender) {
						requestRender = null;
					}
					unsubscribeBranch();
				},
				invalidate() {},
				render(width: number): string[] {
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const message = entry.message as AssistantMessage;
							totalInput += message.usage.input;
							totalOutput += message.usage.output;
							totalCacheRead += message.usage.cacheRead;
							totalCacheWrite += message.usage.cacheWrite;
							totalCost += message.usage.cost.total;
						}
					}

					const contextUsage = ctx.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? currentModel?.contextWindow ?? 0;
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
					const contextPercentDisplay =
						contextPercent === "?"
							? `?/${formatTokens(contextWindow)}${AUTO_COMPACT_LABEL}`
							: `${contextPercent}%/${formatTokens(contextWindow)}${AUTO_COMPACT_LABEL}`;

					let contextPart: string;
					if (contextPercentValue > 90) {
						contextPart = theme.fg("error", contextPercentDisplay);
					} else if (contextPercentValue > 70) {
						contextPart = theme.fg("warning", contextPercentDisplay);
					} else {
						contextPart = theme.fg("dim", contextPercentDisplay);
					}

					const statsParts: string[] = [];
					if (totalInput) statsParts.push(theme.fg("dim", `↑${formatTokens(totalInput)}`));
					if (totalOutput) statsParts.push(theme.fg("dim", `↓${formatTokens(totalOutput)}`));
					if (totalCacheRead) statsParts.push(theme.fg("dim", `R${formatTokens(totalCacheRead)}`));
					if (totalCacheWrite) statsParts.push(theme.fg("dim", `W${formatTokens(totalCacheWrite)}`));
					if (totalCost || usingSubscription) {
						const cost = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
						statsParts.push(theme.fg("dim", cost));
					}
					statsParts.push(contextPart);

					const elapsedMs = runStartedAt === null ? lastElapsedMs : Date.now() - runStartedAt;
					if (elapsedMs > 0 || runStartedAt !== null) {
						const label = runStartedAt === null ? "ran for" : "runs for";
						statsParts.push(`${theme.fg("dim", label)} ${theme.fg("accent", formatElapsed(elapsedMs))}`);
					}

					let left = statsParts.join(theme.fg("dim", " "));
					let leftWidth = visibleWidth(left);
					if (leftWidth > width) {
						left = truncateToWidth(left, width, theme.fg("dim", "..."));
						leftWidth = visibleWidth(left);
					}

					let right = theme.fg("dim", currentModel?.id || "no-model");
					if (footerData.getAvailableProviderCount() > 1 && currentModel) {
						const withProvider = theme.fg("dim", `(${currentModel.provider}) ${currentModel.id}`);
						if (leftWidth + 2 + visibleWidth(withProvider) <= width) {
							right = withProvider;
						}
					}

					const rightWidth = visibleWidth(right);
					let statsLine = left;
					if (leftWidth + 2 + rightWidth <= width) {
						statsLine = left + " ".repeat(width - leftWidth - rightWidth) + right;
					}

					const pwdLine = truncateToWidth(
						theme.fg("dim", formatPwd(ctx, footerData.getGitBranch())),
						width,
						theme.fg("dim", "..."),
					);
					const lines = [pwdLine, truncateToWidth(statsLine, width, theme.fg("dim", "..."))];

					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const sortedStatuses = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text));
						const statusLine = sortedStatuses.join(" ");
						if (statusLine) {
							lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
						}
					}

					return lines;
				},
			};
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		resetRun();
		installFooter(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		resetRun();
		installFooter(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		syncModelState(ctx);
		installFooter(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		syncModelState(ctx);
		stopTicker();
		lastElapsedMs = 0;
		runStartedAt = Date.now();
		triggerRender();
		interval = setInterval(() => {
			triggerRender();
		}, TICK_INTERVAL_MS);
	});

	pi.on("agent_end", async (_event, ctx) => {
		syncModelState(ctx);
		if (runStartedAt !== null) {
			lastElapsedMs = Date.now() - runStartedAt;
		}
		runStartedAt = null;
		stopTicker();
		triggerRender();
	});

	pi.on("session_shutdown", async () => {
		stopTicker();
		requestRender = null;
	});
}
