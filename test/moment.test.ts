import { describe, expect, it } from "vite-plus/test";
import { momentIn } from "../src/record/moment.ts";

describe("momentIn", () => {
	it("reads a wall-clock time in a zone with no summer time", () => {
		expect(momentIn("2026-11-02 07:30", "Africa/Kigali").toISOString()).toBe(
			"2026-11-02T05:30:00.000Z",
		);
	});

	it("follows a zone's summer time", () => {
		expect(momentIn("2026-07-01 12:00", "Europe/Paris").toISOString()).toBe(
			"2026-07-01T10:00:00.000Z",
		);
		expect(momentIn("2026-12-01 12:00", "Europe/Paris").toISOString()).toBe(
			"2026-12-01T11:00:00.000Z",
		);
	});

	it("reads a date alone as its midnight", () => {
		expect(momentIn("2026-11-02", "UTC").toISOString()).toBe(
			"2026-11-02T00:00:00.000Z",
		);
	});
});
