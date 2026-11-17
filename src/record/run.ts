import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Ctx, Host, Lang, Role, Shape, Step, Topic } from "./types.ts";

/*
 * One run of one topic in one language and one shape: a fresh start from the host
 * (`open`), the app driven on a phone (360 x 740, touch)
 * or a desktop (1440 x 900) by the topic's steps, and what the film needs:
 *
 *  - `video.mp4`: every frame the page showed, captured from the browser at the
 *    device's own pixels (a phone at 3x: 1080 x 2220; the desktop at 1.5x),
 *    cut together at the times they were seen. Playwright's own video is held
 *    to the CSS size, which is soft when a phone fills a 1080-wide film.
 *  - `recording.json`: each step's start and end in the video, where each tap
 *    and typing landed (CSS pixels), and what the step asks the film to move in on.
 *  - `shots/<step>.png`: the screen at the end of each step, for the guide page.
 *
 * With `capture: false` (the smoke check) the steps run just the same, without
 * the pauses, the frames or the files.
 */

export const VIEWPORT: Record<Shape, { width: number; height: number }> = {
	phone: { width: 360, height: 740 },
	desktop: { width: 1440, height: 900 },
};
/** How much sharper than CSS pixels the frames are. */
const SCALE: Record<Shape, number> = { phone: 3, desktop: 1.5 };

export type Box = { x: number; y: number; w: number; h: number };
export type Tap = Box & { t: number; kind: "tap" | "type" };
export type RecordedStep = {
	id: string;
	/** Milliseconds into the video. */
	t0: number;
	t1: number;
	taps: Tap[];
	focus: Box[];
	/** When each key was pressed, milliseconds into the video: the film's typing sound. */
	keys?: number[];
	shot: string;
};
export type Recording = {
	slug: string;
	lang: Lang;
	shape: Shape;
	viewport: { width: number; height: number };
	/** The video's size in pixels. */
	size: { width: number; height: number };
	video: string;
	durationMs: number;
	steps: RecordedStep[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * The hand. The film draws its cursor from where each press landed (src/guide/Guide.tsx,
 * cursorAt); the real mouse makes the same trip at the same time, so what the page
 * does under a moving hand (a button's hover, a menu's highlighted row) is on the film
 * where the cursor is. These numbers are the film's: change them together.
 */
const travelMs = (distance: number) =>
	Math.min(980, Math.max(420, 380 + distance * 0.45));
const SETTLE = 140;
/** cubic-bezier(0.45, 0, 0.2, 1): the film's `glide`, eased at both ends. */
function glide(x: number) {
	const [x1, y1, x2, y2] = [0.45, 0, 0.2, 1];
	const at = (t: number, a: number, b: number) =>
		3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (at(mid, x1, x2) < x) lo = mid;
		else hi = mid;
	}
	return at((lo + hi) / 2, y1, y2);
}
/** Typing, a key at a time, as a person types: the film hears each one. */
const KEY_MS = 120;

/** Time to read a caption: a little over 15 characters a second, held for at least 2 s. */
export const dwellMs = (caption: string) =>
	Math.min(6500, Math.max(2200, caption.length * 62));

class Frames {
	private readonly page: Page;
	private readonly dir: string;
	readonly times: number[] = [];
	private running = false;
	private held = 0;
	private misses = 0;
	private inflight: Promise<unknown> = Promise.resolve();
	private loop: Promise<void> | undefined;
	private readonly t0 = performance.now();
	constructor(page: Page, dir: string) {
		this.page = page;
		this.dir = dir;
	}
	now() {
		return Math.round(performance.now() - this.t0);
	}
	start() {
		this.running = true;
		this.loop = (async () => {
			let last = 0;
			while (this.running) {
				const wait = 40 - (performance.now() - last);
				if (wait > 0) await sleep(wait);
				if (this.held > 0) {
					await sleep(20);
					continue;
				}
				last = performance.now();
				const asked = this.now();
				// The page's own screenshot, at the device's pixels.
				const shot = this.page.screenshot({
					type: "jpeg",
					quality: 88,
					scale: "device",
					animations: "allow",
					caret: "initial",
					timeout: 5000,
				});
				this.inflight = shot.catch(() => {});
				let data: Buffer;
				try {
					data = await shot;
				} catch (error) {
					// A frame the browser did not give is skipped; the one before stays on the film.
					this.misses++;
					if (process.env.GUIDE_DEBUG)
						console.log(`    a frame was missed at ${this.now()} ms`);
					if (this.misses > 6) throw error;
					continue;
				}
				this.misses = 0;
				const seen = Math.round((asked + this.now()) / 2);
				const name = String(this.times.length).padStart(6, "0");
				writeFileSync(join(this.dir, `${name}.jpg`), data);
				this.times.push(seen);
			}
		})();
	}
	/** No frames while `work` runs: a screenshot taken across a navigation can wait for ever. What was last seen stays on the film. */
	async hold<T>(work: () => Promise<T>): Promise<T> {
		this.held++;
		try {
			await this.inflight;
			return await work();
		} finally {
			this.held--;
		}
	}
	async stop() {
		this.running = false;
		await this.loop;
	}
}

/** The frames cut together at the times they were seen, at a steady 30 a second. */
function encode(dir: string, times: number[], out: string) {
	const lines: string[] = [];
	times.forEach((time, index) => {
		const next = times[index + 1] ?? time + 120;
		lines.push(`file '${join(dir, `${String(index).padStart(6, "0")}.jpg`)}'`);
		lines.push(`duration ${Math.max(0.001, (next - time) / 1000).toFixed(4)}`);
	});
	// The concat demuxer needs the last file again for the last duration to count.
	lines.push(lines[lines.length - 2]!);
	const list = join(dir, "frames.txt");
	writeFileSync(list, lines.join("\n"));
	const done = spawnSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			list,
			"-vf",
			"fps=30,format=yuv420p",
			"-c:v",
			"libx264",
			"-crf",
			"16",
			"-preset",
			"veryfast",
			// A key frame every half second and none out of order: the film seeks to any frame.
			"-g",
			"15",
			"-bf",
			"0",
			"-movflags",
			"+faststart",
			out,
		],
		{ stdio: "inherit" },
	);
	if (done.status !== 0)
		throw new Error("ffmpeg could not make the recording's video.");
}

export type RunOptions = {
	host: Host<any>;
	browser: Browser;
	topic: Topic;
	lang: Lang;
	shape: Shape;
	/** Records the video, the times and the pictures; off for the smoke check. */
	capture: boolean;
	/** Where a capture goes; `<host.out>/rec/<topic>/<lang>-<shape>` unless given. */
	outDir?: string;
	/**
	 * A browser already in use, for a story told in scenes: no fresh start from the host,
	 * the person signed in as they are, and the page left open after.
	 */
	session?: { context: BrowserContext; page: Page; data: any };
	/** The page the run starts on; `null` stays where the session is. Default `/home`. */
	startPath?: string | null;
	/** How long each caption is held; default `dwellMs`. */
	dwell?: (caption: string) => number;
};

/** A browser context as walkthru records in: the device's size and pixels, the app's language and time zone. */
export function newDeviceContext(
	host: Host<any>,
	browser: Browser,
	shape: Shape,
	lang: Lang,
	capture: boolean,
): Promise<BrowserContext> {
	const phone = shape === "phone";
	return browser.newContext({
		viewport: VIEWPORT[shape],
		deviceScaleFactor: capture ? SCALE[shape] : 1,
		isMobile: phone,
		hasTouch: phone,
		baseURL: host.baseUrl,
		locale: host.locale(lang),
		timezoneId: host.timezone,
		serviceWorkers: "block",
	});
}

export async function runTopic(
	options: RunOptions,
): Promise<Recording | undefined> {
	const { host, browser, topic, lang, shape, capture, session } = options;
	const say = host.say;
	const where = `${topic.slug} (${lang}, ${shape})`;
	const holdFor = options.dwell ?? dwellMs;
	const viewport = VIEWPORT[shape];
	const phone = shape === "phone";
	let data: any;
	let context: BrowserContext;
	let page: Page;
	if (session) {
		({ context, page, data } = session);
	} else {
		const opened = await host.open(topic, lang);
		data = opened.data;
		context = await newDeviceContext(host, browser, shape, lang, capture);
		await context.addCookies(opened.cookies);
		page = await context.newPage();
		page.setDefaultTimeout(15_000);
	}
	const outDir =
		options.outDir ?? join(host.out, "rec", topic.slug, `${lang}-${shape}`);
	let frames: Frames | undefined;
	const framesDir = join(outDir, "frames");
	if (capture) {
		rmSync(outDir, { recursive: true, force: true });
		mkdirSync(framesDir, { recursive: true });
		mkdirSync(join(outDir, "shots"), { recursive: true });
	}
	const now = () => frames?.now() ?? 0;
	const hold = <T>(work: () => Promise<T>) =>
		frames ? frames.hold(work) : work();
	let taps: Tap[] = [];
	let focus: Box[] = [];
	let keys: number[] = [];
	/** Where the real mouse is; none at a run's start, as the film's cursor comes in from aside. */
	let pointer: { x: number; y: number } | undefined;

	async function boxOf(target: Locator): Promise<Box> {
		const shown = target.filter({ visible: true }).first();
		await shown.waitFor({ state: "visible" });
		// Filmed, the page glides to what is off screen, as a person scrolls; the box is read once it has stopped.
		if (capture)
			await shown.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const seen =
					r.top >= 0 &&
					r.left >= 0 &&
					r.bottom <= window.innerHeight &&
					r.right <= window.innerWidth;
				if (!seen) el.scrollIntoView({ behavior: "smooth", block: "center" });
			});
		// A list that draws again as it settles can swap the element out under the scroll: look it up again.
		for (let tries = 0; ; tries++) {
			try {
				await shown.scrollIntoViewIfNeeded();
				break;
			} catch (error) {
				if (tries >= 4 || !String(error).includes("not attached")) throw error;
				await sleep(200);
				await shown.waitFor({ state: "visible" });
			}
		}
		// Held still: a sheet sliding in has not arrived, and a tap there would miss.
		let box = await shown.boundingBox();
		for (let tries = 0; tries < 30; tries++) {
			await sleep(100);
			const next = await shown.boundingBox();
			if (
				box &&
				next &&
				next.x === box.x &&
				next.y === box.y &&
				next.width === box.width &&
				next.height === box.height
			)
				break;
			box = next;
		}
		if (!box) throw new Error("the target has no place on the screen");
		return { x: box.x, y: box.y, w: box.width, h: box.height };
	}
	const mid = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

	/** The real mouse to `to`, on the film's cursor's way and time, then still for a moment. */
	async function walk(to: { x: number; y: number }) {
		const view = page.viewportSize() ?? { width: 1440, height: 900 };
		const from = pointer ?? {
			x: Math.min(view.width - 20, to.x + 220),
			y: Math.min(view.height - 20, to.y + 140),
		};
		if (!pointer) await page.mouse.move(from.x, from.y);
		const distance = Math.hypot(to.x - from.x, to.y - from.y);
		const nx = distance === 0 ? 0 : -(to.y - from.y) / distance;
		const ny = distance === 0 ? 0 : (to.x - from.x) / distance;
		const duration = travelMs(distance);
		const start = performance.now();
		for (;;) {
			const e = performance.now() - start;
			const p = glide(Math.min(1, e / duration));
			const bend = Math.sin(p * Math.PI) * distance * 0.06;
			await page.mouse.move(
				from.x + (to.x - from.x) * p + nx * bend,
				from.y + (to.y - from.y) * p + ny * bend,
			);
			if (e >= duration) break;
			await sleep(12);
		}
		pointer = to;
		await sleep(SETTLE);
	}

	/** Keys pressed one at a time and heard on the film; unfilmed, at once. */
	async function keyIn(text: string) {
		if (!capture) return page.keyboard.type(text);
		for (const ch of text) {
			keys.push(now());
			await page.keyboard.type(ch);
			await sleep(KEY_MS);
		}
	}

	async function ready() {
		await page
			.getByRole("status", { name: "Opening" })
			.waitFor({ state: "detached", timeout: 30_000 })
			.catch(() => {});
	}

	const ctx: Ctx = {
		page,
		shape,
		lang,
		data,
		ui: (english, values) => say(lang, english, values),
		by: (role: Role, english, opts = {}) =>
			(opts.within ?? page).getByRole(role, {
				name: say(lang, english, opts.values),
				exact: opts.exact,
			}),
		text: (english, values) => page.getByText(say(lang, english, values)),
		async tap(target) {
			if (process.env.GUIDE_DEBUG) console.log(`    tap ${String(target)}`);
			const box = await boxOf(target);
			const point = mid(box);
			const shown = target.filter({ visible: true }).first();
			const where = { position: { x: point.x - box.x, y: point.y - box.y } };
			// Playwright's own press waits for what covers the target (a toast on its way out) to go;
			// try it first, so the ring lands when the press does.
			if (phone) await shown.tap({ ...where, trial: true });
			else await shown.click({ ...where, trial: true });
			// The hand arriving: on a desktop the real mouse makes the film's cursor's trip.
			if (capture && !phone) await walk(point);
			else if (capture) await sleep(650);
			taps.push({ ...box, t: now(), kind: "tap" });
			if (phone) await shown.tap(where);
			else await shown.click(where);
			if (capture) await sleep(350);
		},
		async type(target, text) {
			await ctx.tap(target);
			await keyIn(text);
			// A field that re-draws as it is entered (a message appearing above it) can lose what was typed: say so, and type again.
			const shown = target.filter({ visible: true }).first();
			for (let again = 0; again < 2; again++) {
				const value = await shown.inputValue().catch(() => text);
				if (value.replace(/\s/g, "") === text.replace(/\s/g, "")) break;
				await page.keyboard.press("ControlOrMeta+a");
				await keyIn(text);
			}
			if (capture) await sleep(300);
		},
		async fill(target, text) {
			await ctx.tap(target);
			await target.fill(text);
			if (capture) await sleep(400);
		},
		async replace(target, text) {
			await ctx.tap(target);
			const shown = target.filter({ visible: true }).first();
			if (!capture) {
				// The smoke run: select all and type over it, as it always has.
				await page.keyboard.press("ControlOrMeta+a");
				await page.keyboard.type(text);
				return;
			}
			// What was there goes as a person takes it away, a key at a time, from its end.
			const old = await shown.inputValue().catch(() => "");
			await page.keyboard.press("End");
			for (let i = 0; i < old.length; i++) {
				keys.push(now());
				await page.keyboard.press("Backspace");
				await sleep(70);
			}
			await keyIn(text);
			// As in `type`: a field that re-draws as it is entered can lose what was typed; take it away and type again.
			for (let again = 0; again < 2; again++) {
				const value = await shown.inputValue().catch(() => text);
				if (value.replace(/\s/g, "") === text.replace(/\s/g, "")) break;
				if (process.env.GUIDE_DEBUG)
					console.log(`    replace: the field holds "${value}", not "${text}"`);
				await page.keyboard.press("End");
				for (let i = 0; i < value.length; i++)
					await page.keyboard.press("Backspace");
				await keyIn(text);
			}
			if (capture) await sleep(300);
		},
		async look(target) {
			focus.push(await boxOf(target));
		},
		async go(path) {
			await hold(async () => {
				if (process.env.GUIDE_DEBUG) console.log(`    go ${path}`);
				await page.goto(path);
				if (process.env.GUIDE_DEBUG) console.log("    arrived");
				await ready();
			});
			if (capture) await sleep(500);
		},
		async signInAs(person, path) {
			await hold(async () => {
				await context.clearCookies();
				// What the last person left on this device (a panel they had open) is not the next person's.
				await page.evaluate(async () => {
					localStorage.clear();
					sessionStorage.clear();
					for (const database of (await indexedDB.databases?.()) ?? [])
						if (database.name) indexedDB.deleteDatabase(database.name);
				});
				await context.addCookies(person.cookies);
				await page.goto(path);
				await ready();
			});
		},
		async expectGone(target) {
			await target.first().waitFor({ state: "hidden" });
		},
		async expectVisible(target) {
			await target
				.filter({ visible: true })
				.first()
				.waitFor({ state: "visible" });
		},
	};

	async function fail(step: string, error: unknown): Promise<never> {
		const message =
			error instanceof Error
				? process.env.GUIDE_DEBUG
					? error.message
					: error.message.split("\n")[0]
				: String(error);
		{
			const shown = capture
				? join(outDir, `failed-${step}.png`)
				: join(host.out, `failed-${topic.slug}-${lang}-${shape}-${step}.png`);
			mkdirSync(join(shown, ".."), { recursive: true });
			await page.screenshot({ path: shown }).catch(() => {});
		}
		throw new Error(
			`The guide topic ${where} broke at step "${step}": ${message}\nThe app has changed under the script: change the step, or the app.`,
			{ cause: error },
		);
	}

	try {
		const startPath =
			options.startPath === undefined ? "/home" : options.startPath;
		if (startPath !== null) {
			await page.goto(startPath);
			await ready();
		}
		try {
			await topic.before?.(ctx);
		} catch (error) {
			return await fail("before", error);
		}
		await sleep(capture ? 600 : 0);
		if (capture) {
			frames = new Frames(page, framesDir);
			frames.start();
			await sleep(400);
		}
		const recorded: RecordedStep[] = [];
		for (const step of topic.steps) {
			taps = [];
			focus = [];
			keys = [];
			const t0 = now();
			if (process.env.GUIDE_DEBUG) console.log(`  ${step.id} at ${t0} ms`);
			try {
				await step.run(ctx);
				const targets = step.focus?.(ctx);
				for (const target of Array.isArray(targets)
					? targets
					: targets
						? [targets]
						: [])
					await ctx.look(target);
				if (capture)
					await page.screenshot({
						path: join(outDir, "shots", `${step.id}.png`),
						scale: "device",
						animations: "allow",
					});
			} catch (error) {
				return await fail(step.id, error);
			}
			// A step with no caption in this language still holds, as an empty one does.
			if (capture) await sleep(holdFor(step.caption[lang] ?? ""));
			recorded.push({
				id: step.id,
				t0,
				t1: now(),
				taps,
				focus,
				keys,
				shot: `shots/${step.id}.png`,
			});
		}
		if (!capture || !frames) return undefined;
		const durationMs = frames.now();
		await frames.stop();
		const video = join(outDir, "video.mp4");
		encode(framesDir, frames.times, video);
		rmSync(framesDir, { recursive: true, force: true });
		const size = {
			width: Math.round(viewport.width * SCALE[shape]),
			height: Math.round(viewport.height * SCALE[shape]),
		};
		const recording: Recording = {
			slug: topic.slug,
			lang,
			shape,
			viewport,
			size,
			video: "video.mp4",
			durationMs,
			steps: recorded,
		};
		writeFileSync(
			join(outDir, "recording.json"),
			JSON.stringify(recording, null, "\t"),
		);
		return recording;
	} finally {
		await frames?.stop().catch(() => {});
		if (!session) await context.close();
	}
}

export type { Step };
