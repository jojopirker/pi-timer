import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const headSha = process.env.HEAD_SHA;
const runId = process.env.RUN_ID;
const defaultBranch = process.env.DEFAULT_BRANCH;
const screenshotBranch = process.env.SCREENSHOT_BRANCH ?? "ci-footer-screenshots";
const screenshotDirectory = resolve(process.env.SCREENSHOT_DIRECTORY ?? "validated");
const marker = "<!-- pi-timer-footer-screenshots -->";

if (!repository || !token || !headSha || !runId || !defaultBranch) {
	throw new Error("Missing required GitHub Actions environment variables");
}

const [owner, repo] = repository.split("/");

async function github(path, options = {}) {
	const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
		...options,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			...options.headers,
		},
	});

	if (options.allowNotFound && response.status === 404) return undefined;
	if (!response.ok) {
		throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
	}
	if (response.status === 204) return undefined;
	return response.json();
}

async function resolvePullRequest() {
	const run = await github(`/actions/runs/${runId}`);
	const candidates = run.pull_requests ?? [];
	for (const candidate of candidates) {
		const pull = await github(`/pulls/${candidate.number}`);
		if (pull.head.sha === headSha) return pull;
	}

	const pulls = await github(`/commits/${headSha}/pulls`);
	const pull = pulls.find((candidate) => candidate.head.sha === headSha);
	if (!pull) throw new Error(`Could not resolve a pull request for ${headSha}`);
	return pull;
}

async function ensureScreenshotBranch() {
	const existing = await github(`/git/ref/heads/${encodeURIComponent(screenshotBranch)}`, { allowNotFound: true });
	if (existing) return;

	const base = await github(`/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
	await github("/git/refs", {
		method: "POST",
		body: JSON.stringify({ ref: `refs/heads/${screenshotBranch}`, sha: base.object.sha }),
	});
}

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadScreenshot(pullNumber, filename) {
	const path = `pr-${pullNumber}/${filename}`;
	const encodedPath = encodePath(path);
	const existing = await github(`/contents/${encodedPath}?ref=${encodeURIComponent(screenshotBranch)}`, {
		allowNotFound: true,
	});
	const content = (await readFile(resolve(screenshotDirectory, filename))).toString("base64");
	const body = {
		branch: screenshotBranch,
		content,
		message: `ci: update PR #${pullNumber} ${filename}`,
	};
	if (existing?.sha) body.sha = existing.sha;

	await github(`/contents/${encodedPath}`, { method: "PUT", body: JSON.stringify(body) });
	return `https://raw.githubusercontent.com/${owner}/${repo}/${screenshotBranch}/${path}?sha=${headSha}`;
}

async function upsertComment(pullNumber, urls) {
	const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
	const body = `${marker}
## Footer screenshots

Generated from \`${headSha.slice(0, 7)}\`. [Workflow run](${runUrl})

### Idle

![Idle footer](${urls.idle})

### Active run

![Active footer](${urls.active})

### Completed run

![Completed footer](${urls.complete})`;

	const comments = await github(`/issues/${pullNumber}/comments?per_page=100`);
	const existing = comments.find(
		(comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
	);
	if (existing) {
		await github(`/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
		return;
	}
	await github(`/issues/${pullNumber}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

const pull = await resolvePullRequest();
await ensureScreenshotBranch();
const urls = {
	idle: await uploadScreenshot(pull.number, "footer-idle.png"),
	active: await uploadScreenshot(pull.number, "footer-active.png"),
	complete: await uploadScreenshot(pull.number, "footer-complete.png"),
};
await upsertComment(pull.number, urls);
