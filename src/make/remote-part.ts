/*
 * On a build machine: draw this machine's share of a film. The job's folder has
 * `job.json` (the film's input, its length, the render's settings, the chunks) and
 * `public/` (what the film reads: its recordings and ground). Each chunk named on the
 * command line is drawn into `out/<chunk>.mp4`.
 *
 *   node src/make/remote-part.ts <job folder> <chunk id>…
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drawParts } from "./parts.ts";
import type { Job } from "./remote.ts";

const [dir, ...ids] = process.argv.slice(2);
if (!dir || !ids.length)
	throw new Error("node src/make/remote-part.ts <job folder> <chunk id>…");
const job = JSON.parse(readFileSync(path.join(dir, "job.json"), "utf8")) as Job;
const out = path.join(dir, "out");
mkdirSync(out, { recursive: true });
const chunks = ids.map((id) => {
	const chunk = job.chunks.find((c) => c.id === id);
	if (!chunk) throw new Error(`No chunk ${id} in this job.`);
	return chunk;
});
await drawParts({
	publicDir: path.join(dir, "public"),
	input: job.input,
	total: job.total,
	parts: chunks.map((c) => ({ id: c.id, from: c.from, to: c.to, key: "" })),
	settings: job.settings,
	fileOf: (part) => path.join(out, `${part.id}.mp4`),
	onPart: (part, s) => console.log(`drew ${part.id} (${s} s)`),
});
