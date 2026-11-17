import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SOUND = path.join(import.meta.dirname, "..", "sound");
const RATE = 48_000;

/** The left channel of a 16-bit stereo WAV, as numbers from -1 to 1. */
function left(file: string) {
	const data = readFileSync(file).subarray(44);
	const out = new Float64Array(data.length / 4);
	for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 4) / 32767;
	return out;
}

const peak = (x: Float64Array, from: number, to: number) => {
	let p = 0;
	for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i++)
		p = Math.max(p, Math.abs(x[i]!));
	return p;
};

const run = (script: string, ...args: string[]) => {
	const done = spawnSync("python3", [script, ...args], {
		cwd: SOUND,
		encoding: "utf8",
	});
	expect(done.status, done.stderr).toBe(0);
};

describe("the hand", () => {
	it("clicks at each press, about -24 dBFS, and is silent between", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "walkthru-sound-"));
		writeFileSync(
			path.join(dir, "presses.json"),
			JSON.stringify({ clicks: [1, 3], keys: [] }),
		);
		run(
			"hand.py",
			"5",
			path.join(dir, "presses.json"),
			path.join(dir, "hand.wav"),
		);
		const x = left(path.join(dir, "hand.wav"));
		expect(x.length).toBe(5 * RATE);
		for (const at of [1, 3]) {
			const p = peak(x, at, at + 0.05);
			expect(p).toBeGreaterThan(0.03);
			expect(p).toBeLessThan(0.07);
		}
		expect(peak(x, 1.2, 2.9)).toBe(0);
		expect(peak(x, 0, 0.99)).toBe(0);
	});

	it("ticks softer for keys than for clicks", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "walkthru-sound-"));
		writeFileSync(
			path.join(dir, "presses.json"),
			JSON.stringify({ clicks: [1], keys: [3] }),
		);
		run(
			"hand.py",
			"4",
			path.join(dir, "presses.json"),
			path.join(dir, "hand.wav"),
		);
		const x = left(path.join(dir, "hand.wav"));
		expect(peak(x, 2.98, 3.06)).toBeLessThan(peak(x, 1, 1.05));
	});
});

describe("the piano", () => {
	it("is as long as the film, fades in and out, and never clips", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "walkthru-sound-"));
		run("piano.py", "12", path.join(dir, "piano.wav"));
		const x = left(path.join(dir, "piano.wav"));
		expect(x.length).toBe(12 * RATE);
		expect(peak(x, 0, 0.01)).toBeLessThan(0.01);
		expect(peak(x, 11.99, 12)).toBeLessThan(0.01);
		expect(peak(x, 0, 12)).toBeLessThan(1);
		expect(peak(x, 3, 9)).toBeGreaterThan(0.1);
	});
});
