/*
 * Drawing parts of a film: the one loop that turns a film's input and a list of parts
 * into a video file each. The local `draw` runs it, and so does a build machine drawing
 * its share (src/make/remote-part.ts), so a part is the same wherever it was drawn.
 */
import type { StoryProps } from "../film/Story.tsx";
import type { Part } from "../plan.ts";

export type PartSettings = Record<string, unknown>;

export async function drawParts(options: {
	/** What the film reads besides its input: the recordings, the grounds. */
	publicDir: string;
	input: StoryProps;
	/** The film's length as its plan has it: drawing refuses a film that disagrees. */
	total: number;
	parts: Part[];
	settings: PartSettings;
	/** Where each part goes. */
	fileOf: (part: Part) => string;
	onPart?: (part: Part, seconds: number) => void;
}) {
	const { publicDir, input, total, parts, settings, fileOf } = options;
	if (!parts.length) return;
	const renderer = await import("@remotion/renderer");
	const { bundleFilms } = await import("../render/bundle.ts");
	const serveUrl = await bundleFilms(publicDir);
	const composition = await renderer.selectComposition({
		serveUrl,
		id: input.shape === "landscape" ? "StoryLandscape" : "StoryUpright",
		inputProps: input,
		logLevel: "error",
	});
	if (composition.durationInFrames !== total)
		throw new Error(
			`The film is ${composition.durationInFrames} frames and its plan ${total}: the timeline and the film disagree.`,
		);
	for (const part of parts) {
		const started = Date.now();
		await renderer.renderMedia({
			serveUrl,
			composition,
			inputProps: input,
			codec: "h264",
			muted: true,
			outputLocation: fileOf(part),
			logLevel: "error",
			imageFormat: "jpeg",
			frameRange: [part.from, part.to - 1],
			...settings,
		});
		options.onPart?.(part, Math.round((Date.now() - started) / 1000));
	}
}
