import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
	keepSceneSha,
	sceneSha,
	sceneStates,
	toFilm,
} from "../src/make/stale.ts";
import type { Scene } from "../src/record/types.ts";

const scene = (id: string, over: Partial<Scene> = {}): Scene => ({
	id,
	at: "2026-11-02 07:30",
	day: { en: "Monday" },
	steps: [
		{
			id: "sell",
			caption: { en: "Record the sale." },
			run: async (ctx) => {
				await ctx.tap(ctx.by("button", "Record sale"));
			},
		},
	],
	...over,
});

describe("sceneSha", () => {
	it("does not change with a caption, a card or the day's words", () => {
		const a = scene("a");
		const b = scene("a", {
			day: { en: "Lundi" },
			card: { title: { en: "After a week" } },
			steps: [{ ...a.steps[0]!, caption: { en: "Fixed caption." } }],
		});
		expect(sceneSha(b)).toBe(sceneSha(a));
	});

	it("changes with what the camera sees: a step's code, the moment, who, the speed", () => {
		const a = scene("a");
		const changes: Partial<Scene>[] = [
			{
				steps: [
					{
						...a.steps[0]!,
						run: async (ctx) => {
							await ctx.tap(ctx.by("button", "Save"));
						},
					},
				],
			},
			{ at: "2026-11-03 07:30" },
			{ as: { name: "Aline", email: "aline@example.com" } },
			{ speed: 3 },
			{ start: "/sell" },
			{ offCamera: async () => {} },
		];
		for (const change of changes)
			expect(sceneSha(scene("a", change))).not.toBe(sceneSha(a));
	});
});

describe("sceneStates and toFilm", () => {
	const setup = () => {
		const dir = mkdtempSync(path.join(tmpdir(), "walkthru-stale-"));
		const scenes = ["a", "b", "c", "d"].map((id) => scene(id));
		for (const s of scenes.slice(0, 3)) {
			mkdirSync(path.join(dir, s.id));
			writeFileSync(path.join(dir, s.id, "recording.json"), "{}");
			keepSceneSha(path.join(dir, s.id), s);
		}
		return { dir, scenes };
	};

	it("knows filmed, changed and new scenes", () => {
		const { dir, scenes } = setup();
		scenes[1] = scene("b", { speed: 2 });
		expect(sceneStates(dir, scenes).map((s) => s.state)).toEqual([
			"filmed",
			"changed",
			"filmed",
			"new",
		]);
	});

	it("films from the first change to the end, or only the changed with --only", () => {
		const { dir, scenes } = setup();
		scenes[1] = scene("b", { speed: 2 });
		const states = sceneStates(dir, scenes);
		expect(toFilm(states)).toEqual(["b", "c", "d"]);
		expect(toFilm(states, true)).toEqual(["b", "d"]);
	});

	it("films nothing when every scene is filmed from its script", () => {
		const { dir, scenes } = setup();
		expect(toFilm(sceneStates(dir, scenes.slice(0, 3)))).toEqual([]);
	});

	it("takes a recording with no fingerprint as filmed", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "walkthru-stale-"));
		mkdirSync(path.join(dir, "a"));
		writeFileSync(path.join(dir, "a", "recording.json"), "{}");
		expect(sceneStates(dir, [scene("a")])[0]!.state).toBe("filmed");
	});
});
