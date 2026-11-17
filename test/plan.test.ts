import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
	codeSha,
	fileSha,
	joinArgs,
	missingParts,
	partFile,
	sweepParts,
	planParts,
	type PlannedFilm,
} from "../src/plan.ts";
import { filmParts } from "../src/timeline.ts";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), "walkthru-"));
	for (const id of ["a", "b", "c"])
		writeFileSync(
			path.join(dir, `${id}.mp4`),
			`recording of ${id}`.repeat(100),
		);
});

const film = (over: Partial<PlannedFilm> = {}): PlannedFilm => ({
	title: "A first month",
	summary: "From signing in to a month of records.",
	closing: "Record each sale the day it happens.",
	shape: "landscape",
	lang: "en",
	scenes: ["a", "b", "c"].map((id) => ({
		id,
		video: `${id}.mp4`,
		caption: id,
	})),
	...over,
});

const plan = (f: PlannedFilm, code = "code-1") =>
	planParts({
		film: f,
		parts: filmParts(
			f.scenes.map((s) => ({
				durationMs: 1000,
				speed: 1,
				card: s.card,
				steps: [],
			})),
			30,
			f.closing,
		),
		recordings: dir,
		code,
		settings: { crf: 20 },
	});

const keys = (f: PlannedFilm, code?: string) =>
	Object.fromEntries(plan(f, code).map((p) => [p.id, p.key]));

describe("planParts", () => {
	it("cuts the film into the title, each scene and the closing page, end to end", () => {
		const parts = plan(film());
		expect(parts.map((p) => p.id)).toEqual(["title", "a", "b", "c", "closing"]);
		for (let i = 1; i < parts.length; i++)
			expect(parts[i]!.from).toBe(parts[i - 1]!.to);
		expect(parts[0]!.from).toBe(0);
	});

	it("gives the same parts the same keys", () => {
		expect(keys(film())).toEqual(keys(film()));
	});

	it("redraws a changed scene and the one that fades in from it, nothing else", () => {
		const before = keys(film());
		const changed = film();
		changed.scenes[1] = { ...changed.scenes[1]!, caption: "fixed" } as never;
		const after = keys(changed);
		expect(after.title).toBe(before.title);
		expect(after.a).toBe(before.a);
		expect(after.b).not.toBe(before.b);
		expect(after.c).not.toBe(before.c);
		expect(after.closing).toBe(before.closing);
	});

	it("redraws a scene whose recording changed, though its words did not", () => {
		const before = keys(film());
		writeFileSync(path.join(dir, "a.mp4"), "filmed again".repeat(100));
		expect(keys(film()).a).not.toBe(before.a);
	});

	it("redraws the scene before a new card, which now goes out into it", () => {
		const before = keys(film());
		const withCard = film();
		withCard.scenes[2] = {
			...withCard.scenes[2]!,
			card: { title: "After a week" },
		};
		expect(keys(withCard).b).not.toBe(before.b);
	});

	it("redraws everything when the code or the look changes", () => {
		const before = keys(film());
		for (const after of [
			keys(film(), "code-2"),
			keys(film({ look: { ground: "dusk" } })),
		])
			for (const id of Object.keys(before))
				expect(after[id]).not.toBe(before[id]);
	});
});

describe("missingParts", () => {
	it("lists the parts not drawn yet; only a sweep forgets the ones the film no longer has", () => {
		const cache = path.join(dir, "cache");
		const parts = plan(film());
		mkdirSync(path.join(cache, "f"), { recursive: true });
		writeFileSync(partFile(cache, "f", parts[0]!), "drawn");
		writeFileSync(path.join(cache, "f", "a-oldkey.mp4"), "stale");
		writeFileSync(path.join(cache, "f", "notes.txt"), "kept");
		const missing = missingParts(cache, "f", parts);
		expect(missing.map((p) => p.id)).toEqual(["a", "b", "c", "closing"]);
		// Planning reads only.
		expect(existsSync(path.join(cache, "f", "a-oldkey.mp4"))).toBe(true);
		sweepParts(cache, "f", parts);
		expect(existsSync(path.join(cache, "f", "a-oldkey.mp4"))).toBe(false);
		expect(existsSync(path.join(cache, "f", "notes.txt"))).toBe(true);
		expect(existsSync(partFile(cache, "f", parts[0]!))).toBe(true);
	});
});

describe("joinArgs", () => {
	it("joins the parts in order, as they are", () => {
		const cache = path.join(dir, "cache");
		mkdirSync(path.join(cache, "f"), { recursive: true });
		const parts = plan(film());
		const args = joinArgs(cache, "f", parts, "out.mp4");
		expect(args).toContain("copy");
		expect(args.at(-1)).toBe("out.mp4");
		const list = readFileSync(path.join(cache, "f", "parts.txt"), "utf8").split(
			"\n",
		);
		expect(list).toEqual(parts.map((p) => `file '${partFile(cache, "f", p)}'`));
	});
});

describe("fingerprints", () => {
	it("tells recordings apart by content, not by name", () => {
		expect(fileSha(path.join(dir, "a.mp4"))).not.toBe(
			fileSha(path.join(dir, "b.mp4")),
		);
	});

	it("does not change when the code's folder moves", () => {
		const one = path.join(dir, "one", "src");
		const two = path.join(dir, "two", "elsewhere", "src");
		for (const at of [one, two]) {
			mkdirSync(at, { recursive: true });
			writeFileSync(path.join(at, "film.tsx"), "export const film = 1;");
		}
		expect(codeSha([one])).toBe(codeSha([two]));
		writeFileSync(path.join(two, "film.tsx"), "export const film = 2;");
		expect(codeSha([one])).not.toBe(codeSha([two]));
	});
});
