/*
 * The Studio: `walkthru studio`, a local page to bring the films up to date and to
 * tune their look. The films page shows each story in each language with what `make`
 * would do; its buttons run the same commands as the command line, one at a time, and
 * the row's own text says what is happening. The look page is where the look is tuned
 * and saved.
 */
import { spawn } from "node:child_process";
import {
	createReadStream,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import path from "node:path";
import type { Config } from "../config.ts";
import { planLine, planStory } from "../make/planner.ts";

const CLI = path.join(import.meta.dirname, "..", "cli.ts");
const TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".avif": "image/avif",
	".html": "text/html; charset=utf-8",
	".json": "application/json",
};
const isImage = (name: string) => /\.(png|jpe?g|webp|avif)$/i.test(name);

type Job = {
	running: boolean;
	story?: string;
	lang?: string;
	action: string;
	/** The last line the command printed: what the row says while it runs. */
	last?: string;
	lines: string[];
	error?: string;
};

export function studio(config: Config, cwd: string, port: number) {
	let job: Job | undefined;

	const filesIn = (dir: string, base = dir): string[] =>
		!existsSync(dir)
			? []
			: readdirSync(dir).flatMap((name) => {
					const full = path.join(dir, name);
					return statSync(full).isDirectory()
						? filesIn(full, base)
						: isImage(name)
							? [path.relative(base, full)]
							: [];
				});

	const send = (res: ServerResponse, file: string) => {
		if (!file || !existsSync(file))
			return void res.writeHead(404).end("not found");
		res.writeHead(200, {
			"content-type":
				TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
			"cache-control": "no-store",
		});
		createReadStream(file).pipe(res);
	};
	const json = (res: ServerResponse, value: unknown, status = 200) =>
		void res
			.writeHead(status, {
				"content-type": "application/json",
				"cache-control": "no-store",
			})
			.end(JSON.stringify(value));
	const inside = (base: string | undefined, rest: string) => {
		if (!base) return "";
		const full = path.resolve(base, decodeURIComponent(rest));
		return full.startsWith(path.resolve(base)) ? full : "";
	};
	const body = (req: IncomingMessage) =>
		new Promise<string>((resolve) => {
			let text = "";
			req.on("data", (chunk) => {
				text += chunk;
			});
			req.on("end", () => resolve(text));
		});

	/** Runs the command line, one job at a time; its printed lines are the job's state. */
	function start(
		action: string,
		args: string[],
		story?: string,
		lang?: string,
	) {
		const current: Job = { running: true, action, story, lang, lines: [] };
		job = current;
		const child = spawn(process.execPath, [CLI, ...args, "--yes"], { cwd });
		const take = (chunk: Buffer) => {
			for (const line of chunk
				.toString()
				.split("\n")
				.map((l) => l.trimEnd())
				.filter(Boolean)) {
				current.lines.push(line);
				if (current.lines.length > 400) current.lines.shift();
				// The row says what is happening in people's words: "Drew sign-in (200 s)".
				const shown = line
					.trim()
					.replace(
						/^(filmed|ran|drew)\b/,
						(w) => w[0]!.toUpperCase() + w.slice(1),
					);
				current.last = shown;
			}
		};
		child.stdout.on("data", take);
		child.stderr.on("data", take);
		child.on("close", (code) => {
			current.running = false;
			if (code !== 0) current.error = current.last ?? `ended with code ${code}`;
		});
	}

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", "http://studio");
		const p = url.pathname;
		if (p === "/")
			return send(res, path.join(import.meta.dirname, "films.html"));
		if (p === "/look")
			return send(res, path.join(import.meta.dirname, "look.html"));
		if (p === "/api/state") {
			const final = url.searchParams.get("final") === "1";
			const stories = Object.values(config.stories).map((story) => ({
				slug: story.slug,
				title: story.title.en ?? Object.values(story.title)[0] ?? story.slug,
				langs: config.languages.map((lang) => {
					try {
						const plan = planStory({
							config,
							story,
							lang,
							shape: "landscape",
							final,
						});
						return {
							lang,
							line: planLine(plan),
							upToDate: !plan.film.length && !plan.draw?.parts,
							scenes: plan.states,
						};
					} catch (error) {
						return {
							lang,
							line: error instanceof Error ? error.message : String(error),
							upToDate: false,
							scenes: [],
						};
					}
				}),
			}));
			return json(res, {
				stories,
				job: job ? { ...job, lines: job.lines.slice(-120) } : null,
			});
		}
		if (p === "/api/run" && req.method === "POST") {
			if (job?.running) return json(res, "Another job is running.", 409);
			const { action, story, lang, from, to, final } = JSON.parse(
				await body(req),
			);
			const quality = final ? ["--final"] : [];
			if (action === "make" && story && lang)
				start(action, ["make", story, "--lang", lang, ...quality], story, lang);
			else if (action === "record" && story && lang && from)
				start(
					action,
					["record", story, "--lang", lang, "--from", from, "--to", to ?? from],
					story,
					lang,
				);
			else if (action === "make-all") {
				const steps = Object.keys(config.stories).flatMap((slug) =>
					config.languages.map((lang) => [
						"make",
						slug,
						"--lang",
						lang,
						...quality,
					]),
				);
				// One after another, each as its own command.
				const next = () => {
					const step = steps.shift();
					if (!step) return;
					start("make", step, step[1], step[3]);
					const watch = setInterval(() => {
						if (job?.running) return;
						clearInterval(watch);
						if (!job?.error) next();
					}, 500);
				};
				next();
			} else return json(res, "Not a job the Studio knows.", 400);
			return json(res, { started: true });
		}
		// The look page: its pictures, its screens, its saved look.
		if (p === "/list") {
			const shots = filesIn(config.studio?.shots ?? "");
			return json(res, {
				backgrounds: filesIn(config.studio?.backgrounds ?? "").sort(),
				wide: shots.filter((s) => s.endsWith("-wide.webp")).sort(),
				phone: shots
					.filter((s) => s.endsWith(".webp") && !s.endsWith("-wide.webp"))
					.sort(),
				look:
					config.lookFile && existsSync(config.lookFile)
						? JSON.parse(readFileSync(config.lookFile, "utf8"))
						: config.look,
			});
		}
		if (p.startsWith("/bg/"))
			return send(res, inside(config.studio?.backgrounds, p.slice(4)));
		if (p.startsWith("/shot/"))
			return send(res, inside(config.studio?.shots, p.slice(6)));
		if (p === "/save" && req.method === "POST") {
			if (!config.lookFile)
				return json(res, "No lookFile in walkthru.config.ts to save to.", 400);
			writeFileSync(
				config.lookFile,
				`${JSON.stringify(JSON.parse(await body(req)), null, "\t")}\n`,
			);
			return json(res, { saved: config.lookFile });
		}
		res.writeHead(404).end("not found");
	});
	server.listen(port, "127.0.0.1");
	return server;
}
