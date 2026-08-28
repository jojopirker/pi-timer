import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import runTimer from "../../extensions/run-timer.ts";

const WIDTH = 96;
const outputDirectory = resolve(process.argv[2] ?? ".artifacts/footer");

type Handler = (event: unknown, context: typeof context) => Promise<void> | void;

const handlers = new Map<string, Handler[]>();
let footerFactory: ((tui: unknown, theme: unknown, footerData: unknown) => FooterComponent) | undefined;
let footerComponent: FooterComponent | undefined;

interface FooterComponent {
	dispose?(): void;
	invalidate(): void;
	render(width: number): string[];
}

const model = {
	id: "claude-sonnet-4-5",
	provider: "anthropic",
	contextWindow: 200_000,
	reasoning: true,
};

const context = {
	model,
	modelRegistry: {
		isUsingOAuth: () => true,
	},
	sessionManager: {
		getEntries: () => [
			{
				type: "message",
				message: {
					role: "assistant",
					usage: {
						input: 14_200,
						output: 3_800,
						cacheRead: 12_000,
						cacheWrite: 1_200,
						cost: { total: 0.107 },
					},
				},
			},
		],
		getSessionName: () => undefined,
	},
	getContextUsage: () => ({ contextWindow: 200_000, percent: 42.3 }),
	ui: {
		setFooter: (factory: typeof footerFactory) => {
			footerFactory = factory;
		},
	},
};

const pi = {
	on(event: string, handler: Handler) {
		const eventHandlers = handlers.get(event) ?? [];
		eventHandlers.push(handler);
		handlers.set(event, eventHandlers);
	},
	getThinkingLevel: () => "medium",
};

const colors = {
	accent: [94, 234, 212],
	dim: [113, 113, 122],
	error: [248, 113, 113],
	warning: [251, 191, 36],
} as const;

const theme = {
	fg(name: keyof typeof colors, text: string) {
		const [red, green, blue] = colors[name];
		return `\u001b[38;2;${red};${green};${blue}m${text}\u001b[0m`;
	},
};

const tui = { requestRender() {} };
const footerData = {
	getAvailableProviderCount: () => 2,
	getExtensionStatuses: () => new Map<string, string>(),
	getGitBranch: () => "codex/example",
	onBranchChange: () => () => {},
};

async function emit(event: string, data: unknown = { type: event }) {
	for (const handler of handlers.get(event) ?? []) {
		await handler(data, context);
	}
}

function renderFooter(): string[] {
	if (!footerComponent) throw new Error("Extension did not install a footer");
	return footerComponent.render(WIDTH);
}

const originalNow = Date.now;
const originalHome = process.env.HOME;

try {
	process.env.HOME = dirname(process.cwd());
	let now = Date.UTC(2026, 7, 28, 12, 0, 0);
	Date.now = () => now;

	runTimer(pi as never);
	await emit("session_start", { type: "session_start", reason: "startup" });
	if (!footerFactory) throw new Error("Extension did not install a footer");
	footerComponent = footerFactory(tui, theme, footerData);
	const idle = renderFooter();

	await emit("agent_start");
	now += 12_345;
	const active = renderFooter();

	await emit("agent_end");
	const complete = renderFooter();
	await emit("session_shutdown");
	footerComponent.dispose?.();

	mkdirSync(outputDirectory, { recursive: true });
	writeFileSync(
		resolve(outputDirectory, "footer-states.json"),
		JSON.stringify(
			{
				piVersion: process.env.PI_VERSION ?? "current",
				states: { idle, active, complete },
				width: WIDTH,
			},
			null,
			2,
		),
	);
} finally {
	Date.now = originalNow;
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
}
