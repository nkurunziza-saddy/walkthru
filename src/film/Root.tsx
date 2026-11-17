import { Composition } from "remotion";
import { Guide, GUIDE_FPS, guideLength, type GuideProps } from "./Guide.tsx";
import { Story, storyLength, type StoryProps } from "./Story.tsx";

/*
 * The films a render can draw. A film's length comes from its input (`calculateMetadata`):
 * the recordings and words decide it, as the timeline says.
 *
 *   Guide: one topic, one recording, a caption a step.
 *   Story: one business over days, a recording a scene.
 */

const SHAPES = ["landscape", "upright"] as const;

const EMPTY_GUIDE: GuideProps = {
	shape: "landscape",
	lang: "en",
	title: "",
	summary: "",
	practice: "",
	ground: "shop",
	video: "",
	durationMs: 1000,
	viewport: { width: 1440, height: 900 },
	size: { width: 1920, height: 1200 },
	steps: [{ id: "none", caption: "", t0: 0, t1: 1000, taps: [], focus: [] }],
};

const EMPTY_STORY: StoryProps = {
	shape: "landscape",
	lang: "en",
	title: "",
	summary: "",
	practice: "",
	start: "2026-11-02",
	look: {
		frameWidth: 91,
		frameHeight: 92,
		innerPad: 6,
		frameStyle: "glass",
		frameAlpha: 0.31,
		frameColor: "#ffffff",
		appRadius: 10,
		radius: 16,
		shadow: 70,
		shadowAlpha: 0.25,
		edge: 0,
		caption: true,
		captionStyle: "pill",
		captionAt: "below",
		captionSize: 22,
		captionCard: 0.61,
	},
	scenes: [],
};

const size = (shape: (typeof SHAPES)[number]) =>
	shape === "landscape"
		? { width: 1920, height: 1080 }
		: { width: 1080, height: 1920 };
const named = (film: string, shape: (typeof SHAPES)[number]) =>
	`${film}${shape === "landscape" ? "Landscape" : "Upright"}`;

export function Root() {
	return (
		<>
			{SHAPES.map((shape) => (
				<Composition
					calculateMetadata={({ props }) => ({
						durationInFrames: guideLength(props),
					})}
					component={Guide}
					defaultProps={{ ...EMPTY_GUIDE, shape }}
					durationInFrames={GUIDE_FPS * 10}
					fps={GUIDE_FPS}
					id={named("Guide", shape)}
					key={`guide-${shape}`}
					{...size(shape)}
				/>
			))}
			{SHAPES.map((shape) => (
				<Composition
					calculateMetadata={({ props }) => ({
						durationInFrames: storyLength(props),
					})}
					component={Story}
					defaultProps={{ ...EMPTY_STORY, shape }}
					durationInFrames={GUIDE_FPS * 10}
					fps={GUIDE_FPS}
					id={named("Story", shape)}
					key={`story-${shape}`}
					{...size(shape)}
				/>
			))}
		</>
	);
}
