/*
 * A story recorded scene by scene. The app is started at the first scene's moment and
 * started again at each next one's (everything kept), the browsers' clocks moved with
 * it; one browser goes through the whole story, so the person who signed in on day one
 * is still signed in on day twenty-nine, and each person of the team has a browser of
 * their own from their first scene. Each scene is a recording of its own,
 * `<out>/rec/<story>/<lang>-<shape>/<scene>/`, and `story.json` beside them lists them.
 *
 * `from` films from that scene: the scenes before it are played through at dry-run speed
 * (no pauses, no frames) to build the state it starts from, and keep their recordings.
 * `to` stops after that scene. So a scene fixed is filmed again in minutes.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keepSceneSha } from "../make/stale.ts";
import { momentIn } from "./moment.ts";
import { newDeviceContext, runTopic } from "./run.ts";
import type {
	Host,
	Lang,
	Person,
	Shape,
	Story,
	StoryHost,
	Topic,
} from "./types.ts";

export type StoryRun<S extends Story> = {
	host: StoryHost<S>;
	browser: Browser;
	story: S;
	lang: Lang;
	shape: Shape;
	/** Plays the steps without filming: the smoke check. */
	dry?: boolean;
	/** The scene to film from; the ones before it are played through and keep their recordings. */
	from?: string;
	/** The last scene to play. */
	to?: string;
	/** Told each scene as it is done. */
	onScene?: (scene: string, filmed: boolean, seconds: number) => void;
};

/** Records a story. Throws on a step that fails, after closing what it opened. */
export async function recordStory<S extends Story>(run: StoryRun<S>) {
	const { host, browser, story, lang, shape, dry = false } = run;
	const scenes = story.scenes;
	const indexOf = (id: string | undefined, otherwise: number) => {
		if (id === undefined) return otherwise;
		const at = scenes.findIndex((scene) => scene.id === id);
		if (at < 0)
			throw new Error(
				`No scene ${id} in ${story.slug}: ${scenes.map((s) => s.id).join(", ")}.`,
			);
		return at;
	};
	const fromIndex = indexOf(run.from, 0);
	const toIndex = indexOf(run.to, scenes.length - 1);
	const first = scenes[0];
	if (!first) throw new Error(`${story.slug} has no scenes.`);
	const out = join(host.out, "rec", story.slug, `${lang}-${shape}`);
	mkdirSync(out, { recursive: true });
	const moment = (at: string) => momentIn(at, host.timezone);
	// A topic's run needs a host to make its browser; a story's people are made here.
	const asHost = {
		...host,
		open: async () => ({ cookies: [], data: {} }),
	} as Host;

	const browserFor = async (at: string) => {
		const context = await newDeviceContext(asHost, browser, shape, lang, !dry);
		await context.addCookies(
			(host.cookies?.(lang) ?? []).map((cookie) => ({
				url: host.baseUrl,
				...cookie,
			})),
		);
		await context.clock.install({ time: moment(at) });
		const page = await context.newPage();
		page.setDefaultTimeout(15_000);
		return { context, page };
	};

	let server = await host.start(story, first.at, true);
	const owner = await browserFor(first.at);
	const people = new Map<string, { context: BrowserContext; page: Page }>();
	const browserOf = async (person: Person, at: string) => {
		const known = people.get(person.email);
		if (known) return known;
		const made = await browserFor(at);
		people.set(person.email, made);
		return made;
	};
	const state = host.state(story, lang, async () =>
		(await owner.context.cookies(host.baseUrl))
			.map((cookie) => `${cookie.name}=${cookie.value}`)
			.join("; "),
	);

	try {
		for (const [index, scene] of scenes.entries()) {
			if (index > toIndex) break;
			// Before the scene to film from: played through for the state, its recording kept.
			const replay = index < fromIndex;
			if (replay && !dry && !existsSync(join(out, scene.id, "recording.json")))
				throw new Error(
					`Scene ${scene.id} has no recording to keep: film the whole story once before filming from a scene.`,
				);
			if (index > 0) {
				await server.stop();
				server = await host.start(story, scene.at, false);
				await host.between?.();
			}
			state.today = scene.at.slice(0, 10);
			const who = scene.as ? await browserOf(scene.as, scene.at) : owner;
			for (const { context } of [owner, ...people.values()])
				await context.clock.setSystemTime(moment(scene.at));
			const started = Date.now();
			if (scene.offCamera) await scene.offCamera(state);
			const topic: Topic = {
				slug: `${story.slug}/${scene.id}`,
				title: story.title,
				summary: story.summary,
				practice: story.practice,
				ground: "",
				steps: scene.steps,
			};
			await runTopic({
				host: asHost,
				browser,
				topic,
				lang,
				shape,
				capture: !dry && !replay,
				outDir: join(out, scene.id),
				session: { context: who.context, page: who.page, data: state },
				startPath: scene.start === undefined ? "/home" : scene.start,
				// A speed run holds only a moment at the end of each step: the film plays it fast under one caption.
				dwell: (scene.speed ?? 1) > 1 ? () => 700 : undefined,
			});
			// What it was filmed from, so a later change to its script is seen.
			if (!dry && !replay) keepSceneSha(join(out, scene.id), scene);
			run.onScene?.(
				scene.id,
				!dry && !replay,
				Math.round((Date.now() - started) / 1000),
			);
		}
	} finally {
		for (const { context } of people.values())
			await context.close().catch(() => {});
		await owner.context.close().catch(() => {});
		await server.stop();
		await host.end?.();
	}
	// The film lists every scene: the ones filmed now and the ones kept from before.
	const all = scenes.map((scene) => ({ id: scene.id, dir: scene.id }));
	if (
		!dry &&
		all.every((scene) => existsSync(join(out, scene.id, "recording.json")))
	)
		writeFileSync(
			join(out, "story.json"),
			JSON.stringify(
				{ slug: story.slug, lang, shape, scenes: all },
				null,
				"\t",
			),
		);
}
