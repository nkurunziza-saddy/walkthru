/**
 * The instant a wall-clock time "YYYY-MM-DD HH:MM" is in a time zone ("Africa/Kigali"):
 * the instant whose local time there reads that way.
 */
export function momentIn(at: string, timeZone: string): Date {
	const [date, time = "00:00"] = at.trim().split(" ");
	const [y, m, d] = date!.split("-").map(Number);
	const [hh, mm] = time.split(":").map(Number);
	const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
	// The zone's offset at that moment, then once more in case it changed across it (summer time).
	let instant = wall - offset(wall, timeZone);
	instant = wall - offset(instant, timeZone);
	return new Date(instant);
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offset(instant: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(instant));
	const get = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value);
	const local = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return local - Math.floor(instant / 1000) * 1000;
}
