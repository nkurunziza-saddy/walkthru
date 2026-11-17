/*
 * A story film's input: the story's words and its scenes' recordings, read from where
 * the recorder put them. Plain node can read this file (no JSX): the command line
 * builds the input here and the film draws it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Lang, Story } from "../record/types.ts";
import type { Brand } from "./brand.tsx";
import type { Look } from "./Guide.tsx";
import type { StoryProps } from "./Story.tsx";

export type Shape = "landscape" | "upright";

/** A film is made from the recording of the screen it shows. */
export const SOURCE: Record<Shape, "desktop" | "phone"> = {
	landscape: "desktop",
	upright: "phone",
};

/** Where a story's recordings are: `<out>/rec/<story>/<lang>-<device>/<scene>/`. */
export const recordingsOf = (
	out: string,
	slug: string,
	lang: Lang,
	shape: Shape,
) => path.join(out, "rec", slug, `${lang}-${SOURCE[shape]}`);

/** What is missing before a film can be drawn: the scenes with no recording. */
export function unrecorded(
	out: string,
	story: Story,
	lang: Lang,
	shape: Shape,
) {
	const dir = recordingsOf(out, story.slug, lang, shape);
	return story.scenes
		.map((scene) => scene.id)
		.filter((id) => !existsSync(path.join(dir, id, "recording.json")));
}

/** The film's input. `video` paths are relative to `out`, which the film is served from. */
export function storyInput(options: {
	out: string;
	story: Story;
	lang: Lang;
	shape: Shape;
	look: Look;
	brand?: Brand;
}): StoryProps {
	const { out, story, lang, shape, look, brand } = options;
	const first = story.scenes[0];
	if (!first) throw new Error(`${story.slug} has no scenes.`);
	const dir = recordingsOf(out, story.slug, lang, shape);
	const words = (w: Record<Lang, string> | undefined) =>
		w?.[lang] ?? w?.en ?? "";
	return {
		...(brand ? { brand } : {}),
		shape,
		lang,
		title: words(story.title),
		summary: words(story.summary),
		practice: words(story.practice),
		look,
		start: first.at.slice(0, 10),
		scenes: story.scenes.map((scene) => {
			const file = path.join(dir, scene.id, "recording.json");
			if (!existsSync(file))
				throw new Error(
					`${story.slug}/${scene.id} has no recording in ${lang} (${SOURCE[shape]}): record it first.`,
				);
			const rec = JSON.parse(readFileSync(file, "utf8"));
			return {
				id: scene.id,
				date: scene.at.slice(0, 10),
				day: words(scene.day),
				...(scene.card
					? {
							card: {
								title: words(scene.card.title),
								...(scene.card.line ? { line: words(scene.card.line) } : {}),
							},
						}
					: {}),
				speed: scene.speed ?? 1,
				...(scene.caption ? { caption: words(scene.caption) } : {}),
				video: path.relative(out, path.join(dir, scene.id, rec.video)),
				durationMs: rec.durationMs,
				viewport: rec.viewport,
				size: rec.size,
				steps: rec.steps.map(
					(step: {
						id: string;
						t0: number;
						t1: number;
						taps: { x: number; y: number; w: number; h: number; t: number }[];
						focus: { x: number; y: number; w: number; h: number }[];
						keys?: number[];
					}) => ({
						id: step.id,
						caption: words(scene.steps.find((s) => s.id === step.id)?.caption),
						t0: step.t0,
						t1: step.t1,
						taps: step.taps,
						focus: step.focus,
						keys: step.keys ?? [],
					}),
				),
			};
		}),
	};
}
