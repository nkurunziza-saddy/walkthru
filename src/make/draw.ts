import { spawnSync } from "node:child_process";
/*
 * A story film drawn in parts (src/plan.ts): the parts nothing has changed in are kept
 * from the last time, the rest drawn, then all joined without re-encoding and, for a
 * final, the sound laid under. Drawing is the heavy part: it is CPU-bound, about 8
 * frames a second for a final and 11 for a draft on a 12-thread machine.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config.ts";
import { storyInput, type Shape } from "../film/input.ts";
import {
	codeSha,
	joinArgs,
	missingParts,
	partFile,
	planParts,
	sweepParts,
	type Part,
} from "../plan.ts";
import type { Lang, Story } from "../record/types.ts";
import { filmParts, filmPresses } from "../timeline.ts";
import { mixSound } from "./sound.ts";

export const FPS = 30;
const ROOT = path.join(import.meta.dirname, "..", "..");

/** How fast frames are drawn here, measured: for an estimate, not a promise. */
export const FRAMES_A_SECOND = { final: 8, draft: 11 };

export function drawSettings(final: boolean) {
	return {
		// The decoded frames of the recordings are cached; uncapped, a story's grew past 15 GB of memory.
		offthreadVideoCacheSizeInBytes: 2 * 1024 ** 3,
		...(final
			? { crf: 20, concurrency: 7, jpegQuality: 92, offthreadVideoThreads: 6 }
			: {
					crf: 30,
					concurrency: 10,
					jpegQuality: 70,
					scale: 0.5,
					x264Preset: "ultrafast" as const,
				}),
	};
}

export const filmName = (
	slug: string,
	lang: Lang,
	shape: Shape,
	final: boolean,
) => `${slug}-${lang}-${shape}${final ? "" : "-draft"}`;

/** The plan of a film: its input, its parts, and which are missing. */
export function planFilm(options: {
	config: Config;
	story: Story;
	lang: Lang;
	shape: Shape;
	final: boolean;
}) {
	const { config, story, lang, shape, final } = options;
	const out = config.host.out;
	const input = storyInput({
		out,
		story,
		lang,
		shape,
		look: config.look,
		brand: config.brand,
	});
	const parts = filmParts(input.scenes, FPS, input.practice);
	const settings = drawSettings(final);
	const plan = planParts({
		film: { ...input, closing: input.practice },
		parts,
		recordings: out,
		code: codeSha(
			[path.join(ROOT, "src", "film")],
			["remotion", "@remotion/renderer"],
			path.join(ROOT, "node_modules"),
		),
		settings,
	});
	const cache = path.join(out, "cache");
	const film = filmName(story.slug, lang, shape, final);
	return {
		input,
		parts,
		plan,
		settings,
		cache,
		film,
		missing: missingParts(cache, film, plan),
	};
}

export async function drawFilm(options: {
	config: Config;
	story: Story;
	lang: Lang;
	shape: Shape;
	final: boolean;
	onPart?: (part: Part, seconds: number) => void;
}) {
	const { config, shape, final } = options;
	const planned = planFilm(options);
	const { input, parts, plan, settings, cache, film, missing } = planned;
	sweepParts(cache, film, plan);
	if (missing.length) {
		const renderer = await import("@remotion/renderer");
		const { bundleFilms } = await import("../render/bundle.ts");
		const serveUrl = await bundleFilms(config.public ?? config.host.out);
		const composition = await renderer.selectComposition({
			serveUrl,
			id: shape === "landscape" ? "StoryLandscape" : "StoryUpright",
			inputProps: input,
			logLevel: "error",
		});
		if (composition.durationInFrames !== parts.total)
			throw new Error(
				`The film is ${composition.durationInFrames} frames and its plan ${parts.total}: the timeline and the film disagree.`,
			);
		for (const part of missing) {
			const started = Date.now();
			await renderer.renderMedia({
				serveUrl,
				composition,
				inputProps: input,
				codec: "h264",
				muted: true,
				outputLocation: partFile(cache, film, part),
				logLevel: "error",
				imageFormat: "jpeg",
				frameRange: [part.from, part.to - 1],
				...settings,
			});
			options.onPart?.(part, Math.round((Date.now() - started) / 1000));
		}
	}
	const joined = path.join(cache, film, "joined.mp4");
	const done = spawnSync("ffmpeg", joinArgs(cache, film, plan, joined), {
		stdio: "inherit",
	});
	if (done.status !== 0) throw new Error("The parts could not be joined.");
	const films = path.join(config.host.out, final ? "films" : "drafts");
	mkdirSync(films, { recursive: true });
	const output = path.join(films, `${film.replace(/-draft$/, "")}.mp4`);
	if (final) {
		const frames = filmPresses(input.scenes, FPS);
		const seconds = (list: number[]) => list.map((f) => f / FPS);
		mixSound({
			picture: joined,
			output,
			presses: { clicks: seconds(frames.clicks), keys: seconds(frames.keys) },
			piano: true,
		});
	} else copyFileSync(joined, output);
	return { output, drawn: missing.length, kept: plan.length - missing.length };
}
