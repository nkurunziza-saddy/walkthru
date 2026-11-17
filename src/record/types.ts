import type { Locator, Page } from "@playwright/test";

/*
 * A topic is one script, and the one source of truth for its film: what is done in
 * the real app (`run`), what is said about each step in each language, and a closing
 * note. The recorder drives the app by these steps; the film says the captions. A
 * step whose target is missing in the app fails the run: a film is also a test.
 */

/** A language, as the host names it ("en", "rw", "fr"). */
export type Lang = string;
/** What is recorded: a phone (360 x 740, touch) or a desktop (1440 x 900). */
export const SHAPES = ["phone", "desktop"] as const;
export type Shape = (typeof SHAPES)[number];

/** The same words in each language. */
export type Words = Record<Lang, string>;

export type Role =
	| "button"
	| "textbox"
	| "radio"
	| "option"
	| "link"
	| "tab"
	| "heading"
	| "checkbox"
	| "switch"
	| "dialog"
	| "alertdialog"
	| "tabpanel";

/** What a step may do, and nothing the screen would not allow a person. */
export type Ctx = {
	page: Page;
	shape: Shape;
	lang: Lang;
	/** What the host's `open` returned for this run: the ids and people the steps use. */
	data: any;
	/** The app's own word for this, in this language (the host's `say`), from its English text. */
	ui: (english: string, values?: Record<string, string | number>) => string;
	/** By role and the app's own name for it (in this language); substring unless `exact`. */
	by: (
		role: Role,
		english: string,
		options?: {
			exact?: boolean;
			values?: Record<string, string | number>;
			within?: Locator;
		},
	) => Locator;
	/** Text on the screen, by its English text in the app. */
	text: (english: string, values?: Record<string, string | number>) => Locator;
	/** Taps (a touch on the phone, a click on the desktop): a ring lands where it does. */
	tap: (target: Locator) => Promise<void>;
	/** Taps the field, then types slowly enough to be read. */
	type: (target: Locator, text: string) => Promise<void>;
	/** Taps the field, then sets its value at once (a date). */
	fill: (target: Locator, text: string) => Promise<void>;
	/** Clears the field and types in it. */
	replace: (target: Locator, text: string) => Promise<void>;
	/** Shows a part of the screen without touching it (the film moves in on it). */
	look: (target: Locator) => Promise<void>;
	/** Opens an address in the app and waits for the page. */
	go: (path: string) => Promise<void>;
	/** Signs in as another person, and opens a page as them. */
	signInAs: (person: { cookies: any[] }, path: string) => Promise<void>;
	/** A fact the step relies on, written in the shape the app shows it; a wrong one fails the run. */
	expectVisible: (target: Locator) => Promise<void>;
	/** What the step closes or finishes is no longer on the screen. */
	expectGone: (target: Locator) => Promise<void>;
};

export type Step = {
	/** Stable: names the step's pictures and chapters. */
	id: string;
	caption: Words;
	/** What is done in the app; ends with the screen showing the result. */
	run: (ctx: Ctx) => Promise<void>;
	/** What the film moves in on while the caption is read, when it helps: the figure, the button. */
	focus?: (ctx: Ctx) => Locator | Locator[];
};

/**
 * A topic: what walkthru needs of it. A host adds its own fields (the sample data a
 * topic starts from, say), which its `open` reads.
 */
export type Topic = {
	slug: string;
	title: Words;
	/** One line, under the title. */
	summary: Words;
	/** The closing note: how it is done well, a few sentences at most. */
	practice: Words;
	/** The picture the film floats on: `ground-<name>-<shape>.png`, the host's own. */
	ground: string;
	/** Before the recording starts and not in it: the page the first step starts on, a tip put away. */
	before?: (ctx: Ctx) => Promise<void>;
	steps: Step[];
};

/** A cookie as the browser takes it (Playwright's `addCookies`). */
export type Cookie = {
	name: string;
	value: string;
	url?: string;
	domain?: string;
	path?: string;
	expires?: number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Strict" | "Lax" | "None";
};

/**
 * What the app being filmed provides. walkthru knows nothing of any app: where it
 * runs, its words, and how a topic starts are the host's.
 */
export type Host<T extends Topic = Topic> = {
	/** Where the app answers ("http://localhost:3072"). */
	baseUrl: string;
	/** The time zone the browser is in ("Africa/Kigali"). */
	timezone: string;
	/** The browser's locale for a language ("en-GB"). */
	locale: (lang: Lang) => string;
	/** The app's own words for its English text, in `lang`: so a script is written once. */
	say: (
		lang: Lang,
		english: string,
		values?: Record<string, string | number>,
	) => string;
	/** A fresh start for a topic: the person signed in (their cookies) and the data its steps use. */
	open: (topic: T, lang: Lang) => Promise<{ cookies: Cookie[]; data: unknown }>;
	/** Where recordings go; the topic's own folder is `<out>/rec/<topic>/<lang>-<shape>`. */
	out: string;
};
