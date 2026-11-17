/*
 * Whose films these are: the name, the mark, the colours and the few words the film
 * says itself. It is plain data, so it travels in a render's input like the rest, and
 * the film reads it from context (`useBrand`) wherever it draws one of these.
 */
import { createContext, useContext } from "react";

export type Lang = string;

/** The words the film says itself, in one language. `steps` has `{n}` for the number. */
export type FilmWords = {
	guide: string;
	goodPractice: string;
	steps: string;
	/** The last line, over the mark: where to find more. */
	more: string;
};

export type Brand = {
	/** Beside the mark on every page: "<name> · Guide". */
	name: string;
	/** Drawn in white on a rounded tile of the accent; left out, no mark. */
	mark?: { viewBox: string; paths: string[] };
	colors: {
		/** The mark's tile, the sweep's edge and the chapters' marks. */
		accent: string;
		/** The accent's darker ink, for small words on white. */
		accentInk: string;
		ink: string;
		ink2: string;
		ink3: string;
		/** A page inside the window. */
		page: string;
		/** Behind everything, so a dissolve never shows bare black. */
		paper: string;
		/** The sweep's edge on a title, from the accent to light. */
		sweep: string[];
	};
	words: Record<Lang, FilmWords>;
};

const ENGLISH: FilmWords = {
	guide: "Guide",
	goodPractice: "Good practice",
	steps: "{n} steps",
	more: "",
};

/** A neutral brand: no mark, the accent the default blue. */
export const DEFAULT_BRAND: Brand = {
	name: "walkthru",
	colors: {
		accent: "oklch(0.55 0.14 255)",
		accentInk: "oklch(0.45 0.14 255)",
		ink: "oklch(0.2046 0 0)",
		ink2: "oklch(0.4009 0.0133 285.8)",
		ink3: "oklch(0.5305 0.0124 286)",
		page: "#ffffff",
		paper: "#e9e2d0",
		sweep: [
			"oklch(0.55 0.14 255)",
			"oklch(0.68 0.1 255)",
			"oklch(0.85 0.05 255)",
		],
	},
	words: { en: ENGLISH },
};

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export const BrandProvider = BrandContext.Provider;

export const useBrand = () => useContext(BrandContext);

/** The film's own words in `lang`, else English's, else the defaults. */
export function wordsOf(brand: Brand, lang: Lang): FilmWords {
	return brand.words[lang] ?? brand.words.en ?? ENGLISH;
}

/** The mark on its tile: a 30-unit tile, rounded 8, in a 32-unit box (the mark's paths are drawn in those units). */
export function Mark({ size, ink = "#fff" }: { size: number; ink?: string }) {
	const brand = useBrand();
	if (!brand.mark) return null;
	return (
		<svg height={size} viewBox={brand.mark.viewBox} width={size}>
			<rect
				fill={brand.colors.accent}
				height={30}
				rx={8}
				width={30}
				x={1}
				y={1}
			/>
			{brand.mark.paths.map((d) => (
				<path d={d} fill={ink} key={d} />
			))}
		</svg>
	);
}
