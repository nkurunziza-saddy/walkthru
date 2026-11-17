import { describe, expect, it } from "vite-plus/test";
import {
	closingFrames,
	filmParts,
	filmPresses,
	PACING,
	sceneFrames,
	type TimedScene,
} from "../src/timeline.ts";

const FPS = 30;
const scene = (over: Partial<TimedScene> = {}): TimedScene => ({
	durationMs: 10_000,
	speed: 1,
	steps: [],
	...over,
});

describe("sceneFrames", () => {
	it("plays the recording at its speed, rounding up", () => {
		expect(sceneFrames(scene(), FPS)).toBe(300);
		expect(sceneFrames(scene({ speed: 3 }), FPS)).toBe(100);
		expect(sceneFrames(scene({ durationMs: 1001 }), FPS)).toBe(31);
	});
});

describe("closingFrames", () => {
	it("holds 6 s at least and 12 s at most", () => {
		expect(closingFrames("", FPS)).toBe(180);
		expect(closingFrames("x".repeat(10_000), FPS)).toBe(360);
		expect(closingFrames("x".repeat(140), FPS)).toBe(360); // 140 / 14 s = 10 s, + 2 s
	});
});

describe("filmParts", () => {
	it("starts each scene after the title and the scenes before it, a card included", () => {
		const parts = filmParts(
			[
				scene(),
				scene({ card: { title: "After a week" } }),
				scene({ speed: 2 }),
			],
			FPS,
			"",
		);
		expect(parts.starts).toEqual([90, 390, 390 + 90 + 300]);
		expect(parts.end).toBe(390 + 90 + 300 + 150);
		expect(parts.total).toBe(parts.end + 180 + PACING.mark);
	});

	it("keeps the closing page and the mark when there are no scenes", () => {
		const parts = filmParts([], FPS, "");
		expect(parts).toEqual({ starts: [], end: 90, total: 90 + 180 + 75 });
	});

	it("takes its own pacing", () => {
		const parts = filmParts([scene({ card: true })], FPS, "", {
			title: 10,
			card: 20,
			mark: 5,
		});
		expect(parts).toEqual({ starts: [10], end: 330, total: 330 + 180 + 5 });
	});
});

describe("filmPresses", () => {
	it("places presses after the title and a scene's card, at the scene's speed", () => {
		const { clicks } = filmPresses(
			[
				scene({ steps: [{ taps: [{ t: 1000 }] }] }),
				scene({ card: true, speed: 2, steps: [{ taps: [{ t: 2000 }] }] }),
			],
			FPS,
		);
		expect(clicks).toEqual([90 + 30, 90 + 300 + 90 + 30]);
	});

	it("hears keys only where the scene plays at its own speed", () => {
		const { keys } = filmPresses(
			[
				scene({ steps: [{ taps: [], keys: [100, 200] }] }),
				scene({ speed: 3, steps: [{ taps: [], keys: [100] }] }),
			],
			FPS,
		);
		expect(keys).toEqual([93, 96]);
	});

	it("agrees with filmParts on where every scene starts", () => {
		const scenes = [scene(), scene({ card: true, speed: 3 }), scene()];
		const parts = filmParts(scenes, FPS, "");
		const presses = filmPresses(
			scenes.map((s) => ({ ...s, steps: [{ taps: [{ t: 0 }] }] })),
			FPS,
		);
		expect(presses.clicks).toEqual([
			parts.starts[0],
			parts.starts[1]! + PACING.card,
			parts.starts[2],
		]);
	});
});
