/*
 * Which scenes must be filmed again. A scene's script fingerprint is what decides what
 * the camera sees: its moment, where it starts, who is in it, how fast it plays, and the
 * code of its steps and of what happens off camera. Not its captions or its card: those
 * are drawn on the film, so a caption fixed is drawn again, not filmed again.
 *
 * It is written beside a scene's recording when the scene is filmed (`script.sha`). A
 * change the fingerprint cannot see (a helper the steps call, the app itself) is filmed
 * again by naming the scene.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Scene } from "../record/types.ts";

export function sceneSha(scene: Scene) {
	const hash = createHash("sha1");
	hash.update(
		JSON.stringify({
			at: scene.at,
			start: scene.start,
			as: scene.as,
			speed: scene.speed ?? 1,
			offCamera: scene.offCamera?.toString() ?? null,
			steps: scene.steps.map((step) => ({
				id: step.id,
				run: step.run.toString(),
				focus: step.focus?.toString() ?? null,
			})),
		}),
	);
	return hash.digest("hex").slice(0, 16);
}

const shaFile = (dir: string) => path.join(dir, "script.sha");

/** Written when a scene is filmed: the script it was filmed from. */
export function keepSceneSha(dir: string, scene: Scene) {
	writeFileSync(shaFile(dir), `${sceneSha(scene)}\n`);
}

export type SceneState = "filmed" | "new" | "changed";

/** Each scene's state against its recording in `dir/<scene>/`. */
export function sceneStates(dir: string, scenes: Scene[]) {
	return scenes.map((scene) => {
		const at = path.join(dir, scene.id);
		if (!existsSync(path.join(at, "recording.json")))
			return { id: scene.id, state: "new" as SceneState };
		const kept = existsSync(shaFile(at))
			? readFileSync(shaFile(at), "utf8").trim()
			: null;
		// A recording made before fingerprints were kept is taken as filmed from its script.
		if (kept === null) return { id: scene.id, state: "filmed" as SceneState };
		return {
			id: scene.id,
			state: (kept === sceneSha(scene) ? "filmed" : "changed") as SceneState,
		};
	});
}

/**
 * What to film: from the first scene that is new or changed to the last scene, since
 * what a scene does is what the scenes after it start from. `only` films just the
 * scenes that are new or changed, when the ones after cannot be told apart.
 */
export function toFilm(
	states: { id: string; state: SceneState }[],
	only = false,
) {
	const first = states.findIndex((s) => s.state !== "filmed");
	if (first < 0) return [];
	if (only) return states.filter((s) => s.state !== "filmed").map((s) => s.id);
	return states.slice(first).map((s) => s.id);
}
