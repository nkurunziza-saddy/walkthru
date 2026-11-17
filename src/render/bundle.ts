import { bundle, type WebpackOverrideFn } from "@remotion/bundler";
/*
 * The films, bundled for drawing. Remotion reads `jsx` from tsconfig through
 * TypeScript's `sys`, which TypeScript 7 lacks, so esbuild falls back to the classic
 * runtime ("React is not defined"): the override sets the automatic one.
 */
import { rmSync } from "node:fs";
import path from "node:path";

export const automaticJsx: WebpackOverrideFn = (config) => ({
	...config,
	module: {
		...config.module,
		rules: config.module?.rules?.map((rule) => {
			if (!rule || typeof rule !== "object" || !Array.isArray(rule.use))
				return rule;
			return {
				...rule,
				use: rule.use.map((use) =>
					use &&
					typeof use === "object" &&
					typeof use.loader === "string" &&
					use.loader.includes("esbuild-loader") &&
					typeof use.options === "object"
						? { ...use, options: { ...use.options, jsx: "automatic" } }
						: use,
				),
			};
		}),
	},
});

/**
 * The films bundled with `publicDir` as what they read (recordings, grounds). The
 * bundle is a copy of `publicDir`, so it is removed when the process ends: renders
 * stopped half way once left 28 GB of them in the temp folder.
 */
export async function bundleFilms(publicDir: string) {
	const serveUrl = await bundle({
		entryPoint: path.join(import.meta.dirname, "..", "film", "index.ts"),
		publicDir,
		webpackOverride: automaticJsx,
	});
	process.on("exit", () => rmSync(serveUrl, { recursive: true, force: true }));
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.once(signal, () => process.exit(130));
	return serveUrl;
}
