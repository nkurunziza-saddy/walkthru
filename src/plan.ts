/*
 * A film cut into parts, so a change draws again only the parts it touches.
 *
 * Each part (the title, each scene, the closing page) is drawn on its own and kept under
 * a fingerprint of everything that makes its frames: the film's code, the look and the
 * render's settings, the part's own words and recording, and what fades into it. The
 * parts are then joined as they are, with no re-encoding. A caption fixed in one scene
 * draws that scene and the one after it (which fades in from it); a change to the code
 * or the look draws them all.
 */
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Parts } from "./timeline.ts";

const sha = (...parts: unknown[]) => {
	const hash = createHash("sha1");
	for (const part of parts) hash.update(String(part)).update("\u0000");
	return hash.digest("hex").slice(0, 16);
};

/**
 * A file's fingerprint: its size and a sample of 4096 places in it. A recording is tens
 * of megabytes, and two recordings of the same length that differ are different nearly
 * everywhere, so a sample tells them apart.
 */
export function fileSha(file: string) {
	const { size } = statSync(file);
	const hash = createHash("sha1").update(String(size));
	const data = readFileSync(file);
	const step = Math.max(1, Math.floor(data.length / 4096));
	for (let i = 0; i < data.length; i += step)
		hash.update(data.subarray(i, i + 8));
	return hash.digest("hex").slice(0, 16);
}

function filesIn(dir: string, out: string[] = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) filesIn(full, out);
		else if (/\.(tsx?|css|json|mjs)$/.test(entry.name)) out.push(full);
	}
	return out.sort((a, b) => a.localeCompare(b));
}

/**
 * What the film is drawn with: every source file under `dirs`, and the version of each
 * package in `packages` (read from `nodeModules`), so a new renderer draws everything again.
 */
export function codeSha(
	dirs: string[],
	packages: string[] = [],
	nodeModules?: string,
) {
	const hash = createHash("sha1");
	for (const dir of dirs)
		for (const file of filesIn(dir))
			hash.update(path.relative(dir, file)).update(readFileSync(file));
	for (const name of packages) {
		const file = nodeModules && path.join(nodeModules, name, "package.json");
		if (file && existsSync(file)) hash.update(readFileSync(file));
	}
	return hash.digest("hex").slice(0, 16);
}

/** What the planner needs to know of a film. `video` is relative to the recordings' folder. */
export type PlannedFilm = {
	title: string;
	summary: string;
	closing: string;
	shape: string;
	lang: string;
	look?: unknown;
	scenes: { id: string; video: string; card?: unknown }[];
};

export type Part = {
	id: string;
	/** The first frame. */
	from: number;
	/** The frame after the last. */
	to: number;
	/** The fingerprint it is kept under. */
	key: string;
};

/** The film's parts, each with its fingerprint. */
export function planParts({
	film,
	parts,
	recordings,
	code,
	settings,
}: {
	film: PlannedFilm;
	parts: Parts;
	/** The folder the scenes' `video` paths are in. */
	recordings: string;
	/** `codeSha` of what draws the film. */
	code: string;
	/** The render's options: a part drawn with others is a different part. */
	settings: unknown;
}): Part[] {
	const { scenes } = film;
	const shared = sha(
		code,
		JSON.stringify(settings),
		film.shape,
		film.lang,
		JSON.stringify(film.look ?? null),
	);
	const sig = scenes.map((scene) =>
		sha(JSON.stringify(scene), fileSha(path.join(recordings, scene.video))),
	);
	const titleSig = sha(film.title, film.summary);
	const plan: Part[] = [
		{
			id: "title",
			from: 0,
			to: parts.starts[0] ?? parts.end,
			key: sha(shared, titleSig),
		},
	];
	scenes.forEach((scene, index) => {
		const before = index === 0 ? titleSig : sig[index - 1];
		const next = scenes[index + 1];
		plan.push({
			id: scene.id,
			from: parts.starts[index]!,
			to: parts.starts[index + 1] ?? parts.end,
			// What fades into it (the part before) and how it goes out (a card or a cut after it).
			key: sha(
				shared,
				sig[index],
				before,
				next ? (next.card ? "card" : "cut") : "end",
			),
		});
	});
	plan.push({
		id: "closing",
		from: parts.end,
		to: parts.total,
		key: sha(
			shared,
			film.closing,
			scenes.length ? sig.at(-1) : titleSig,
			parts.end,
			parts.total,
		),
	});
	return plan;
}

/** Where a part is kept: <cache>/<film>/<id>-<key>.mp4. */
export const partFile = (cache: string, film: string, part: Part) =>
	path.join(cache, film, `${part.id}-${part.key}.mp4`);

/** The parts not drawn yet. It also forgets the ones this film no longer has. */
export function missingParts(cache: string, film: string, plan: Part[]) {
	const dir = path.join(cache, film);
	mkdirSync(dir, { recursive: true });
	const wanted = new Set(
		plan.map((part) => path.basename(partFile(cache, film, part))),
	);
	for (const name of readdirSync(dir))
		if (name.endsWith(".mp4") && !wanted.has(name))
			rmSync(path.join(dir, name), { force: true });
	return plan.filter((part) => !existsSync(partFile(cache, film, part)));
}

/** ffmpeg's arguments to join the parts as they are, into `output`. */
export function joinArgs(
	cache: string,
	film: string,
	plan: Part[],
	output: string,
) {
	const list = path.join(cache, film, "parts.txt");
	writeFileSync(
		list,
		plan.map((part) => `file '${partFile(cache, film, part)}'`).join("\n"),
	);
	return [
		"-v",
		"error",
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		list,
		"-c",
		"copy",
		"-movflags",
		"+faststart",
		output,
	];
}
