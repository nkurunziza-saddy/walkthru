/*
 * A host app's `walkthru.config.ts`: what to film and how.
 *
 *   import { defineConfig } from "walkthru/config";
 *   export default defineConfig({ host, brand, look, stories, languages: ["en", "rw"] });
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Brand } from "./film/brand.tsx";
import type { Look } from "./film/Guide.tsx";
import type { Lang, Story, StoryHost } from "./record/types.ts";

export type Config = {
	/** The app: where it runs, how it starts at a moment, its words, the scenes' shared state. */
	host: StoryHost<any>;
	/** Whose films they are. */
	brand?: Brand;
	/** The window, caption and frame the films are drawn in (the Studio's look). */
	look: Look;
	/** The stories, by slug. */
	stories: Record<string, Story>;
	languages: Lang[];
	/** What the films read besides recordings (`ground-look-<shape>.png`); default the host's `out`. */
	public?: string;
	/** Where the Studio's look page saves the look (a JSON file the config reads `look` from). */
	lookFile?: string;
	/** What the Studio's look page offers: pictures to float the window on, and screens to try it with. */
	studio?: { backgrounds?: string; shots?: string };
};

export const defineConfig = (config: Config) => config;

/** The config in `dir` (`walkthru.config.ts`), or a clear error when there is none. */
export async function loadConfig(dir = process.cwd()): Promise<Config> {
	const file = path.resolve(dir, "walkthru.config.ts");
	if (!existsSync(file))
		throw new Error(
			`No walkthru.config.ts in ${dir}. Make one, or run walkthru from the folder that has it.`,
		);
	const loaded = await import(pathToFileURL(file).href);
	return (loaded.default ?? loaded.config) as Config;
}
