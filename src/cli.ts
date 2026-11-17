#!/usr/bin/env node
/*
 * walkthru: films of an app, made by scripting the real app. Run it from the folder
 * that has walkthru.config.ts.
 *
 *   walkthru plan <story> [--lang rw,en] [--final]     what is out of date, and about how long it takes
 *   walkthru make <story> [--lang rw,en] [--final]     film what changed, draw what changed, lay the sound
 *   walkthru record <story> --lang rw [--from <scene>] [--to <scene>] [--dry]
 *   walkthru draw <story> --lang rw [--final] [--redo]
 *   walkthru studio [--port 4317]                       a local page to update the films and tune their look
 *   walkthru doctor                                     what this machine has and lacks
 *
 * Options: --shape landscape|upright (landscape), --only (film only the changed scenes,
 * not every scene after the first change), --yes (no question before a long job),
 * --anyway (start though the machine is busy).
 */
import { spawnSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { cpus, freemem, loadavg } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig, type Config } from "./config.ts";
import type { Shape } from "./film/input.ts";
import { drawFilm, filmName, FPS } from "./make/draw.ts";
import { minutes, planStory } from "./make/planner.ts";
import type { Story } from "./record/types.ts";

const args = process.argv.slice(2);
const [command, ...rest] = args;
const flag = (name: string) => {
	const at = rest.indexOf(`--${name}`);
	return at < 0 ? undefined : rest[at + 1];
};
const has = (name: string) => rest.includes(`--${name}`);
const valued = new Set(
	["lang", "shape", "from", "to", "port"].map(flag).filter(Boolean),
);
const positional = rest.filter((a) => !a.startsWith("--") && !valued.has(a));
const final = has("final");
const shape = (flag("shape") ?? "landscape") as Shape;
const say = (line = "") => console.log(line);

function storyOf(config: Config, slug: string | undefined): Story {
	const story = slug ? config.stories[slug] : undefined;
	if (!story)
		throw new Error(
			`Name a story: ${Object.keys(config.stories).join(", ") || "(none in the config)"}.`,
		);
	return story;
}

const langsOf = (config: Config) =>
	flag("lang")?.split(",") ?? config.languages;

/** A heavy job waits for a quiet machine: a busy one draws slower and may run short of memory. */
function quietEnough() {
	const busy = loadavg()[0]! / cpus().length;
	const freeGb = freemem() / 1024 ** 3;
	if (has("anyway")) return true;
	if (busy > 0.35 || freeGb < 4) {
		say(
			`The machine is busy (load ${Math.round(busy * 100)}% of ${cpus().length} threads, ${freeGb.toFixed(1)} GB free). Close what else runs and try again, or add --anyway.`,
		);
		return false;
	}
	return true;
}

async function confirm(question: string) {
	if (has("yes") || !process.stdin.isTTY) return true;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`${question} [y/N] `);
	rl.close();
	return /^y(es)?$/i.test(answer.trim());
}

const planOne = (config: Config, story: Story, lang: string) =>
	planStory({ config, story, lang, shape, final, only: has("only") });

function printPlan(config: Config, story: Story, langs: string[]) {
	let total = 0;
	for (const lang of langs) {
		const p = planOne(config, story, lang);
		say(`${story.slug} in ${lang}, ${shape}${final ? ", final" : ", draft"}`);
		const counts = { new: 0, changed: 0, filmed: 0 };
		for (const s of p.states) counts[s.state]++;
		say(
			`  scenes: ${counts.filmed} filmed, ${counts.changed} changed, ${counts.new} new`,
		);
		if (p.film.length) {
			say(
				`  film:   ${p.film.length === 1 ? p.film[0] : `${p.film[0]} to ${p.film.at(-1)}`} (${p.film.length} scene${p.film.length === 1 ? "" : "s"}), about ${minutes(p.seconds)}`,
			);
			say("  draw:   after filming, the parts the new scenes touch");
		} else if (p.draw)
			say(
				p.draw.parts
					? `  draw:   ${p.draw.parts} of ${p.draw.of} parts (${minutes(p.draw.frames / FPS)} of film), about ${minutes(p.seconds)}`
					: "  draw:   nothing: every part is kept",
			);
		total += p.seconds;
	}
	say(`about ${minutes(total)} in all`);
	return total;
}

async function chromium() {
	const { chromium } = await import("@playwright/test");
	return chromium.launch();
}

async function record(
	config: Config,
	story: Story,
	lang: string,
	from?: string,
	to?: string,
) {
	const { recordStory } = await import("./record/story.ts");
	const browser = await chromium();
	try {
		await recordStory({
			host: config.host,
			browser,
			story,
			lang,
			shape: shape === "landscape" ? "desktop" : "phone",
			dry: has("dry"),
			from,
			to,
			onScene: (id, filmed, s) =>
				say(`  ${filmed ? "filmed" : "ran"} ${id} (${s} s)`),
		});
	} finally {
		await browser.close();
	}
}

async function draw(config: Config, story: Story, lang: string) {
	const started = Date.now();
	const result = await drawFilm({
		config,
		story,
		lang,
		shape,
		final,
		onPart: (part, s) => say(`  drew ${part.id} (${s} s)`),
	});
	say(
		`${path.relative(process.cwd(), result.output)}: ${result.kept} parts kept, ${result.drawn} drawn, ${minutes((Date.now() - started) / 1000)}`,
	);
}

function doctor() {
	const check = (name: string, ok: boolean, detail: string) =>
		say(`${ok ? "ok  " : "MISS"}  ${name.padEnd(12)} ${detail}`);
	const runs = (cmd: string, a: string[]) =>
		spawnSync(cmd, a, { encoding: "utf8" });
	const ff = runs("ffmpeg", ["-version"]);
	check("ffmpeg", ff.status === 0, ff.stdout?.split("\n")[0] ?? "not found");
	const np = runs("python3", ["-c", "import numpy; print(numpy.__version__)"]);
	check(
		"numpy",
		np.status === 0,
		np.status === 0
			? `numpy ${np.stdout.trim()}`
			: "pip install -r sound/requirements.txt",
	);
	const pw = runs("npx", ["playwright", "--version"]);
	check("playwright", pw.status === 0, pw.stdout?.trim() || "not found");
	const disk = statfsSync(process.cwd());
	const freeDisk = (disk.bavail * disk.bsize) / 1024 ** 3;
	check(
		"disk",
		freeDisk > 10,
		`${freeDisk.toFixed(0)} GB free (a film's parts and bundle need several)`,
	);
	const busy = loadavg()[0]! / cpus().length;
	check(
		"cpu",
		busy < 0.35,
		`${cpus().length} threads, ${Math.round(busy * 100)}% busy (drawing wants it quiet)`,
	);
	check(
		"memory",
		freemem() / 1024 ** 3 > 4,
		`${(freemem() / 1024 ** 3).toFixed(1)} GB free`,
	);
}

async function main() {
	if (!command || command === "help" || has("help")) {
		const head = (await import("node:fs")).readFileSync(
			new URL(import.meta.url),
			"utf8",
		);
		say(
			head
				.split("*/")[0]!
				.split("\n")
				.slice(2)
				.map((l) => l.replace(/^ \* ?/, ""))
				.join("\n"),
		);
		return;
	}
	if (command === "doctor") return doctor();
	const config = await loadConfig();
	if (command === "studio") {
		const { studio } = await import("./studio/server.ts");
		const port = Number(flag("port") ?? 4317);
		studio(config, process.cwd(), port);
		say(`Studio: http://localhost:${port}`);
		return;
	}
	const story = storyOf(config, positional[0]);
	const langs = langsOf(config);
	if (command === "plan") {
		printPlan(config, story, langs);
		return;
	}
	if (command === "record") {
		if (!has("dry") && !quietEnough()) process.exit(1);
		for (const lang of langs)
			await record(config, story, lang, flag("from"), flag("to"));
		return;
	}
	if (command === "draw") {
		if (!quietEnough()) process.exit(1);
		if (has("redo")) {
			const { rmSync } = await import("node:fs");
			for (const lang of langs)
				rmSync(
					path.join(
						config.host.out,
						"cache",
						filmName(story.slug, lang, shape, final),
					),
					{
						recursive: true,
						force: true,
					},
				);
		}
		for (const lang of langs) await draw(config, story, lang);
		return;
	}
	if (command === "make") {
		const total = printPlan(config, story, langs);
		if (total < 1) return;
		if (!quietEnough()) process.exit(1);
		if (total > 300 && !(await confirm("Go on?"))) return;
		for (const lang of langs) {
			const p = planOne(config, story, lang);
			if (has("only"))
				for (const id of p.film) await record(config, story, lang, id, id);
			else if (p.film.length) await record(config, story, lang, p.film[0]);
			await draw(config, story, lang);
		}
		return;
	}
	throw new Error(`No command ${command}: plan, make, record, draw or doctor.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
