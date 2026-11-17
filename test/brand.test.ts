import { describe, expect, it } from "vite-plus/test";
import { type Brand, DEFAULT_BRAND, wordsOf } from "../src/film/brand.tsx";

const brand: Brand = {
	...DEFAULT_BRAND,
	name: "Shop",
	words: {
		en: {
			guide: "Guide",
			goodPractice: "Good practice",
			steps: "{n} steps",
			more: "More",
		},
		fr: {
			guide: "Guide",
			goodPractice: "Bonne pratique",
			steps: "{n} étapes",
			more: "Plus",
		},
	},
};

describe("wordsOf", () => {
	it("says the film's own words in the film's language", () => {
		expect(wordsOf(brand, "fr").goodPractice).toBe("Bonne pratique");
	});

	it("falls back to English, then to the defaults", () => {
		expect(wordsOf(brand, "rw").goodPractice).toBe("Good practice");
		expect(wordsOf({ ...brand, words: {} }, "rw").steps).toBe("{n} steps");
	});
});
