import { defineConfig } from "vite-plus";

export default defineConfig({
	// The same style as Rugero, where this began.
	fmt: {
		useTabs: true,
		printWidth: 80,
		sortPackageJson: false,
		sortImports: {
			newlinesBetween: false,
			groups: [
				["builtin", "external"],
				"internal",
				["parent", "sibling", "index"],
			],
		},
		ignorePatterns: ["**/*.md"],
	},
	test: {
		include: ["test/**/*.test.ts"],
	},
});
