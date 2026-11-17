/*
 * A film's sound laid under its picture, which is copied as it is: the piano (quiet, at
 * -30 LUFS) and the hand (a click for each press, a tick for each key), made in code by
 * `sound/`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOUND = path.join(import.meta.dirname, "..", "..", "sound");

const run = (cmd: string, args: string[], cwd?: string) => {
	const done = spawnSync(cmd, args, { cwd, encoding: "utf8" });
	if (done.status !== 0)
		throw new Error(`${cmd} failed: ${(done.stderr ?? "").trim().slice(-400)}`);
};

export const durationOf = (file: string) =>
	Number(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			file,
		])
			.toString()
			.trim(),
	);

export function mixSound(options: {
	/** The picture, with no sound. */
	picture: string;
	output: string;
	/** In seconds from the film's start. */
	presses: { clicks: number[]; keys: number[] };
	/** The piano under it (a story film); without, the hand alone. */
	piano: boolean;
}) {
	const { picture, output, presses, piano } = options;
	const seconds = String(durationOf(picture));
	const dir = mkdtempSync(path.join(tmpdir(), "walkthru-sound-"));
	try {
		const times = path.join(dir, "presses.json");
		writeFileSync(times, JSON.stringify(presses));
		const hand = path.join(dir, "hand.wav");
		run("python3", ["hand.py", seconds, times, hand], SOUND);
		if (piano) {
			const bed = path.join(dir, "piano.wav");
			const quiet = path.join(dir, "piano-quiet.wav");
			run("python3", ["piano.py", seconds, bed], SOUND);
			run("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-i",
				bed,
				"-af",
				"loudnorm=I=-30:TP=-6:LRA=7",
				"-ar",
				"48000",
				quiet,
			]);
			run("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-i",
				picture,
				"-i",
				quiet,
				"-i",
				hand,
				"-filter_complex",
				"[1:a][2:a]amix=inputs=2:normalize=0[a]",
				"-map",
				"0:v",
				"-map",
				"[a]",
				"-c:v",
				"copy",
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-shortest",
				"-movflags",
				"+faststart",
				output,
			]);
		} else
			run("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-i",
				picture,
				"-i",
				hand,
				"-map",
				"0:v",
				"-map",
				"1:a",
				"-c:v",
				"copy",
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-shortest",
				"-movflags",
				"+faststart",
				output,
			]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
