/*
 * Drawing on build machines (GitHub Actions), so a first draw does not hold this machine
 * for half an hour. The parts to draw are cut into chunks of at most `CHUNK` frames; the
 * film's input and what it reads go up as a release asset of this repository; the
 * `Draw` workflow draws the chunks at once, one machine each, at this very commit (so a
 * part's fingerprint holds); they come back as the run's artifacts and are joined into
 * their parts here. The uploaded inputs are removed when the job ends.
 *
 * It needs `gh`, signed in, and this checkout clean and pushed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoryProps } from "../film/Story.tsx";
import type { Part } from "../plan.ts";
import type { PartSettings } from "./parts.ts";

/** At most this many frames a machine: 10 s of film, a few minutes on two cores. */
export const CHUNK = 300;
const RELEASE = "walkthru-jobs";
const ROOT = path.join(import.meta.dirname, "..", "..");

export type Chunk = {
	id: string;
	/** The part it belongs to. */
	part: string;
	from: number;
	to: number;
};

export type Job = {
	input: StoryProps;
	total: number;
	settings: PartSettings;
	chunks: Chunk[];
};

/** The parts cut into chunks of at most `size` frames, in order. */
export function chunksOf(parts: Part[], size = CHUNK): Chunk[] {
	return parts.flatMap((part) => {
		const count = Math.max(1, Math.ceil((part.to - part.from) / size));
		const step = Math.ceil((part.to - part.from) / count);
		return Array.from({ length: count }, (_, i) => {
			const from = part.from + i * step;
			return {
				id: `${part.id}-${part.key}-${i}`,
				part: part.id,
				from,
				to: Math.min(part.to, from + step),
			};
		});
	});
}

/** The files a film reads from its public folder: its scenes' recordings and its ground. */
export function filesOf(input: StoryProps, publicDir: string) {
	const files = new Set(input.scenes.map((scene) => scene.video));
	const ground = `ground-look-${input.shape}.png`;
	if (existsSync(path.join(publicDir, ground))) files.add(ground);
	return [...files];
}

const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const gh = (...args: string[]) =>
	execFileSync("gh", args, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();

/** The repository and commit the machines draw at: this checkout, which must be clean and pushed. */
function here() {
	if (git("status", "--porcelain"))
		throw new Error(
			"walkthru's checkout has changes: a machine draws a pushed commit, so commit and push first.",
		);
	const commit = git("rev-parse", "HEAD");
	if (!git("branch", "-r", "--contains", commit))
		throw new Error(
			`Commit ${commit.slice(0, 7)} is not pushed: push it first.`,
		);
	const repo = gh(
		"repo",
		"view",
		"--json",
		"nameWithOwner",
		"-q",
		".nameWithOwner",
	);
	return { repo, commit };
}

export async function drawRemote(options: {
	input: StoryProps;
	total: number;
	settings: PartSettings;
	parts: Part[];
	publicDir: string;
	/** Where each finished part goes. */
	fileOf: (part: Part) => string;
	say?: (line: string) => void;
}) {
	const { input, total, settings, parts, publicDir, fileOf } = options;
	const say = options.say ?? console.log;
	if (!parts.length) return;
	const { repo, commit } = here();
	const chunks = chunksOf(parts);
	const job: Job = { input, total, settings, chunks };
	const id = createHash("sha1")
		.update(JSON.stringify(job))
		.update(commit)
		.digest("hex")
		.slice(0, 12);
	const work = mkdtempSync(path.join(tmpdir(), `walkthru-${id}-`));
	try {
		writeFileSync(path.join(work, `${id}.json`), JSON.stringify(job));
		const files = filesOf(input, publicDir);
		const tar = spawnSync("tar", [
			"-cf",
			path.join(work, `${id}.tar`),
			"-C",
			publicDir,
			...files,
		]);
		if (tar.status !== 0)
			throw new Error(`Could not pack the film's files: ${tar.stderr}`);
		// A release holds the inputs; it is made once and its assets removed after each job.
		if (
			spawnSync("gh", ["release", "view", RELEASE, "-R", repo], { cwd: ROOT })
				.status !== 0
		)
			gh(
				"release",
				"create",
				RELEASE,
				"-R",
				repo,
				"--prerelease",
				"--title",
				"Drawing jobs",
				"--notes",
				"Inputs of films drawn on build machines (tools: walkthru draw --remote). Each is removed when its job ends.",
			);
		say(
			`  sending ${files.length} files and ${chunks.length} chunks (job ${id})`,
		);
		gh(
			"release",
			"upload",
			RELEASE,
			"-R",
			repo,
			"--clobber",
			path.join(work, `${id}.json`),
			path.join(work, `${id}.tar`),
		);
		const before = new Date(Date.now() - 5000).toISOString();
		gh(
			"workflow",
			"run",
			"draw.yml",
			"-R",
			repo,
			"-f",
			`job=${id}`,
			"-f",
			`commit=${commit}`,
		);
		// The run is found by its name, which carries the job.
		let run = "";
		for (let tries = 0; tries < 30 && !run; tries++) {
			await new Promise((resolve) => setTimeout(resolve, 3000));
			const list = JSON.parse(
				gh(
					"run",
					"list",
					"-R",
					repo,
					"--workflow",
					"draw.yml",
					"--limit",
					"10",
					"--json",
					"databaseId,displayTitle,createdAt",
				),
			) as { databaseId: number; displayTitle: string; createdAt: string }[];
			run = String(
				list.find((r) => r.displayTitle.includes(id) && r.createdAt >= before)
					?.databaseId ?? "",
			);
		}
		if (!run) throw new Error("The drawing run did not start.");
		say(
			`  drawing on build machines: https://github.com/${repo}/actions/runs/${run}`,
		);
		const watched = spawnSync(
			"gh",
			["run", "watch", run, "-R", repo, "--exit-status", "--interval", "20"],
			{
				cwd: ROOT,
				stdio: "ignore",
			},
		);
		if (watched.status !== 0)
			throw new Error(
				`The drawing run failed: https://github.com/${repo}/actions/runs/${run}`,
			);
		const got = path.join(work, "got");
		gh("run", "download", run, "-R", repo, "-D", got);
		// Each part is its chunks joined as they are.
		for (const part of parts) {
			const mine = chunks.filter(
				(c) => c.part === part.id && c.id.startsWith(`${part.id}-${part.key}-`),
			);
			const list = path.join(work, `${part.id}.txt`);
			const found = mine.map((c) => {
				const dir = path.join(got, `chunk-${c.id}`);
				const file = existsSync(dir)
					? readdirSync(dir).find((f) => f.endsWith(".mp4"))
					: undefined;
				if (!file) throw new Error(`Chunk ${c.id} did not come back.`);
				return path.join(dir, file);
			});
			writeFileSync(list, found.map((f) => `file '${f}'`).join("\n"));
			const target = fileOf(part);
			mkdirSync(path.dirname(target), { recursive: true });
			const joined = spawnSync("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				list,
				"-c",
				"copy",
				`${target}.making.mp4`,
			]);
			if (joined.status !== 0)
				throw new Error(`Part ${part.id} could not be joined.`);
			renameSync(`${target}.making.mp4`, target);
			say(
				`  drew ${part.id} (on ${mine.length} machine${mine.length === 1 ? "" : "s"})`,
			);
		}
	} finally {
		for (const asset of [`${id}.json`, `${id}.tar`])
			spawnSync(
				"gh",
				["release", "delete-asset", RELEASE, asset, "-R", repo, "-y"],
				{ cwd: ROOT },
			);
		rmSync(work, { recursive: true, force: true });
	}
}
