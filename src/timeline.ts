/*
 * A film's timeline, in frames: where each part starts, how long it lasts, and so where
 * each press of the mouse and each key falls. The film's drawing and the tool that lays
 * its sound both read it, so they cannot disagree.
 *
 * A film is a title, then its scenes in order (a scene may have a card in front of it,
 * "After a week"), then a closing page and a mark.
 */

/** How long the fixed pieces last, in frames. */
export type Pacing = {
	/** The title card. */
	title: number;
	/** A card in front of a scene. */
	card: number;
	/** The mark that ends the film. */
	mark: number;
};

/** At 30 frames a second: a 3 s title, a 3 s card, a 2.5 s mark. */
export const PACING: Pacing = { title: 90, card: 90, mark: 75 };

/** A press of the mouse or a key, as the recording saw it: milliseconds into its video. */
export type TimedStep = { taps: { t: number }[]; keys?: number[] };

export type TimedScene = {
	durationMs: number;
	/** Above 1 the scene plays fast (a speed run). */
	speed: number;
	card?: unknown;
	steps: TimedStep[];
};

/** How long the closing page stays: its words read at about 14 characters a second, 6 to 12 s. */
export const closingFrames = (text: string, fps: number) =>
	Math.min(360, Math.max(180, Math.round((text.length / 14) * fps) + 60));

/** A scene's frames: its recording, played at its speed. */
export const sceneFrames = (scene: TimedScene, fps: number) =>
	Math.ceil(((scene.durationMs / 1000) * fps) / scene.speed);

export type Parts = {
	/** Where each scene starts (its card, if it has one, included). */
	starts: number[];
	/** Where the closing page starts. */
	end: number;
	/** The film's length. */
	total: number;
};

/** Where each part of the film starts. A part is what the film is drawn and kept in. */
export function filmParts(
	scenes: TimedScene[],
	fps: number,
	closing: string,
	pacing: Pacing = PACING,
): Parts {
	const starts: number[] = [];
	let at = pacing.title;
	for (const scene of scenes) {
		starts.push(at);
		at += (scene.card ? pacing.card : 0) + sceneFrames(scene, fps);
	}
	return {
		starts,
		end: at,
		total: at + closingFrames(closing, fps) + pacing.mark,
	};
}

/** The film's frame of every press of the mouse and every key, in order. */
export function filmPresses(
	scenes: TimedScene[],
	fps: number,
	pacing: Pacing = PACING,
): { clicks: number[]; keys: number[] } {
	const clicks: number[] = [];
	const keys: number[] = [];
	let at = pacing.title;
	for (const scene of scenes) {
		if (scene.card) at += pacing.card;
		const frame = (ms: number) => at + (ms / 1000) * (fps / scene.speed);
		for (const step of scene.steps) {
			for (const tap of step.taps) clicks.push(frame(tap.t));
			// Sped up, keys would run into a buzz: a speed run is heard by its clicks only.
			if (scene.speed === 1)
				for (const key of step.keys ?? []) keys.push(frame(key));
		}
		at += sceneFrames(scene, fps);
	}
	return { clicks, keys };
}
