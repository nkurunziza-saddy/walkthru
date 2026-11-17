/*
 * Proof that drawing on build machines gives the same film as drawing here: a sample
 * film of two test-pattern scenes (no app, nothing private) is drawn both ways and the
 * two compared frame by frame.
 *
 *   node tools/check-remote.ts            (needs gh signed in, this checkout pushed)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoryProps } from "../src/film/Story.tsx";
import { drawSettings } from "../src/make/draw.ts";
import { drawParts } from "../src/make/parts.ts";
import { drawRemote } from "../src/make/remote.ts";
import { codeSha, joinArgs, partFile, planParts } from "../src/plan.ts";
import { filmParts } from "../src/timeline.ts";

const ROOT = path.join(import.meta.dirname, "..");
const dir = mkdtempSync(path.join(tmpdir(), "walkthru-check-"));
const publicDir = path.join(dir, "public");
const ff = (...args: string[]) => {
	const done = spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
	if (done.status !== 0) throw new Error(String(done.stderr));
};

// Two scenes of a test pattern, as a desktop recording would be (2160 x 1350, a key frame every 15).
const scenes = ["one", "two"].map((id, i) => {
	const rel = path.join("rec", "sample", "en-desktop", id, "video.mp4");
	mkdirSync(path.dirname(path.join(publicDir, rel)), { recursive: true });
	ff(
		"-f",
		"lavfi",
		"-i",
		`testsrc2=size=2160x1350:rate=30:duration=${6 + i * 2}`,
		"-c:v",
		"libx264",
		"-g",
		"15",
		"-bf",
		"0",
		"-pix_fmt",
		"yuv420p",
		path.join(publicDir, rel),
	);
	return {
		id,
		date: `2026-11-0${2 + i}`,
		day: `Day ${i + 1}`,
		...(i === 1 ? { card: { title: "A day later" } } : {}),
		speed: 1,
		video: rel,
		durationMs: (6 + i * 2) * 1000,
		viewport: { width: 1440, height: 900 },
		size: { width: 2160, height: 1350 },
		steps: [
			{
				id: "look",
				caption: "A test pattern.",
				t0: 0,
				t1: (6 + i * 2) * 1000,
				taps: [{ x: 600, y: 400, w: 120, h: 40, t: 2000 }],
				focus: [],
				keys: [],
			},
		],
	};
});
ff(
	"-f",
	"lavfi",
	"-i",
	"color=c=0xd9dde3:size=1920x1080",
	"-frames:v",
	"1",
	path.join(publicDir, "ground-look-landscape.png"),
);

const input = {
	shape: "landscape",
	lang: "en",
	title: "A sample film",
	summary: "Two scenes of a test pattern.",
	practice: "Drawn here and on build machines, the same.",
	look: {
		frameWidth: 91,
		frameHeight: 92,
		innerPad: 6,
		frameStyle: "glass",
		frameAlpha: 0.31,
		frameColor: "#ffffff",
		appRadius: 10,
		radius: 16,
		shadow: 70,
		shadowAlpha: 0.25,
		edge: 0,
		caption: true,
		captionStyle: "pill",
		captionAt: "below",
		captionSize: 22,
		captionCard: 0.61,
	},
	start: "2026-11-02",
	scenes,
} as unknown as StoryProps;

const parts = filmParts(input.scenes, 30, input.practice);
const settings = drawSettings(false);
const plan = planParts({
	film: { ...input, closing: input.practice },
	parts,
	recordings: publicDir,
	code: codeSha([path.join(ROOT, "src", "film")]),
	settings,
});
const cache = path.join(dir, "cache");
const joined: Record<string, string> = {};
for (const where of ["here", "remote"] as const) {
	const film = `sample-${where}`;
	const fileOf = (part: (typeof plan)[number]) => partFile(cache, film, part);
	mkdirSync(path.join(cache, film), { recursive: true });
	const started = Date.now();
	if (where === "here")
		await drawParts({
			publicDir,
			input,
			total: parts.total,
			parts: plan,
			settings,
			fileOf,
		});
	else
		await drawRemote({
			input,
			total: parts.total,
			settings,
			parts: plan,
			publicDir,
			fileOf,
		});
	joined[where] = path.join(cache, film, "joined.mp4");
	execFileSync("ffmpeg", joinArgs(cache, film, plan, joined[where]!));
	console.log(
		`${where}: ${plan.length} parts in ${Math.round((Date.now() - started) / 1000)} s`,
	);
}
const psnr = spawnSync(
	"ffmpeg",
	[
		"-hide_banner",
		"-i",
		joined.here!,
		"-i",
		joined.remote!,
		"-lavfi",
		"psnr",
		"-f",
		"null",
		"-",
	],
	{ encoding: "utf8" },
).stderr;
const frames = (file: string) =>
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-count_frames",
		"-show_entries",
		"stream=nb_read_frames",
		"-of",
		"csv=p=0",
		file,
	])
		.toString()
		.trim();
console.log(
	`frames: here ${frames(joined.here!)}, remote ${frames(joined.remote!)} (the plan: ${parts.total})`,
);
console.log(
	`difference: ${/average:([\d.inf]+)/.exec(psnr)?.[1] ?? "unreadable"} dB PSNR (above 40 is the same to the eye)`,
);
writeFileSync(path.join(dir, "done"), "");
console.log(`kept in ${dir}`);
