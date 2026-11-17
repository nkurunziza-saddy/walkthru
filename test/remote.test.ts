import { describe, expect, it } from "vite-plus/test";
import { chunksOf } from "../src/make/remote.ts";

const part = (id: string, from: number, to: number) => ({
	id,
	from,
	to,
	key: "k",
});

describe("chunksOf", () => {
	it("cuts each part into chunks of at most the size, end to end", () => {
		const chunks = chunksOf([part("title", 0, 90), part("a", 90, 2311)], 300);
		expect(chunks[0]).toEqual({
			id: "title-k-0",
			part: "title",
			from: 0,
			to: 90,
		});
		const a = chunks.filter((c) => c.part === "a");
		expect(a.length).toBe(8);
		expect(a[0]!.from).toBe(90);
		expect(a.at(-1)!.to).toBe(2311);
		for (let i = 1; i < a.length; i++) expect(a[i]!.from).toBe(a[i - 1]!.to);
		for (const c of a) expect(c.to - c.from).toBeLessThanOrEqual(300);
	});

	it("names chunks by their part's key, so a chunk of another drawing is never mistaken for it", () => {
		const [one] = chunksOf([{ id: "a", from: 0, to: 10, key: "k1" }]);
		const [two] = chunksOf([{ id: "a", from: 0, to: 10, key: "k2" }]);
		expect(one!.id).not.toBe(two!.id);
	});
});
