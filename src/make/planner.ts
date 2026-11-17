/*
 * What `make` will do for a story in one language, and about how long it takes: the
 * scenes to film (from the first one whose script changed, or only those), then the
 * parts to draw. The command line prints it; the Studio shows it.
 */
import type { Config } from "../config.ts";
import { recordingsOf, type Shape, unrecorded } from "../film/input.ts";
import type { Story } from "../record/types.ts";
import { FPS, FRAMES_A_SECOND, planFilm } from "./draw.ts";
import { type SceneState, sceneStates, toFilm } from "./stale.ts";

export type Plan = {
	story: string;
	lang: string;
	states: { id: string; state: SceneState }[];
	/** The scenes `make` films, in order. */
	film: string[];
	/** Parts to draw, when nothing needs filming first. */
	draw?: { parts: number; of: number; frames: number };
	/** About how long, in seconds. */
	seconds: number;
};

export function planStory(options: {
	config: Config;
	story: Story;
	lang: string;
	shape: Shape;
	final: boolean;
	only?: boolean;
}): Plan {
	const { config, story, lang, shape, final, only = false } = options;
	const out = config.host.out;
	const states = sceneStates(
		recordingsOf(out, story.slug, lang, shape),
		story.scenes,
	);
	const film = toFilm(states, only);
	const sceneById = new Map(story.scenes.map((s) => [s.id, s]));
	// Filming: the app restarted at the scene's moment, then each step and its pause.
	let seconds = 0;
	for (const id of film) {
		const scene = sceneById.get(id)!;
		seconds += 20 + scene.steps.length * ((scene.speed ?? 1) > 1 ? 4 : 9);
	}
	let draw: Plan["draw"];
	if (film.length === 0 && unrecorded(out, story, lang, shape).length === 0) {
		const planned = planFilm({ config, story, lang, shape, final });
		const frames = planned.missing.reduce((sum, p) => sum + (p.to - p.from), 0);
		draw = { parts: planned.missing.length, of: planned.plan.length, frames };
		const rate = final ? FRAMES_A_SECOND.final : FRAMES_A_SECOND.draft;
		seconds += planned.missing.length ? frames / rate + 20 : 0;
	}
	return { story: story.slug, lang, states, film, draw, seconds };
}

/** "5 min", "40 s". */
export const minutes = (seconds: number) =>
	seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;

/** One line for the plan, as people read it: "2 scenes changed", "Up to date". */
export function planLine(plan: Plan) {
	const changed = plan.states.filter((s) => s.state !== "filmed").length;
	if (plan.film.length)
		return `${changed} scene${changed === 1 ? "" : "s"} to film, about ${minutes(plan.seconds)}`;
	if (plan.draw?.parts)
		return `${plan.draw.parts} of ${plan.draw.of} parts to draw (${minutes(plan.draw.frames / FPS)} of film), about ${minutes(plan.seconds)}`;
	return "Up to date";
}
