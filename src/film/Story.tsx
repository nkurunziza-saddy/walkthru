import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { PACING, sceneFrames as timedFrames } from "../timeline.ts";
import {
	type Brand,
	BrandProvider,
	DEFAULT_BRAND,
	type Lang,
	useBrand,
} from "./brand.tsx";
import { useFonts } from "./fonts.ts";
import {
	Eyebrow as SharedEyebrow,
	WindowPage,
	clamp01,
	ease,
	Frame,
	Ground,
	GUIDE_FPS,
	type GuideProps,
	type GuideStep,
	layout,
	type Layout,
	type Look,
	LookCaption,
	lookLayout,
	Practice,
	practiceLength,
	rise,
	SANS,
	Screen,
} from "./Guide.tsx";
const INTRO = PACING.title;
const TURN = PACING.card;
const END_MARK = PACING.mark;
import { Reveal, Sweep, Swap, Typewrite, typingTime } from "./text.tsx";

/*
 * A story film: one business over days, told in scenes
 * recorded from the real app at each day's moment. A title, then each scene in the
 * look of the guide's films with a chip saying which day it is; the speed run plays
 * its scenes fast under one caption each; a turn in the story ("After a week") is a
 * card with the month's days filling in up to it. Every figure on screen is the
 * app's own.
 */

/** A cut between two scenes of the same day. */
const FADE = 10;
/** Into and out of a turn: the window settles away, the card rises in, slower. */
const TURN_FADE = 22;

export type StoryScene = {
	id: string;
	/** "YYYY-MM-DD" of the scene. */
	date: string;
	day: string;
	card?: { title: string; line?: string };
	speed: number;
	/** The scene's one caption in a speed run. */
	caption?: string;
	video: string;
	durationMs: number;
	viewport: { width: number; height: number };
	size: { width: number; height: number };
	steps: GuideStep[];
};

export type StoryProps = {
	/** Whose film it is: its name, mark, colours and own words. Left out, a neutral one. */
	brand?: Brand;
	shape: "landscape" | "upright";
	lang: Lang;
	title: string;
	summary: string;
	practice: string;
	look: Look;
	/** The month the story runs through, for the calendar on the cards: its first day the story's day one. */
	start: string;
	scenes: StoryScene[];
};

/** Stands in for a story with no scenes, so its good practice still has a screen size. */
const EMPTY_SCENE: StoryScene = {
	id: "",
	date: "",
	day: "",
	speed: 1,
	video: "",
	durationMs: 0,
	viewport: { width: 1440, height: 900 },
	size: { width: 1440, height: 900 },
	steps: [],
};

const sceneFrames = (scene: StoryScene) => timedFrames(scene, GUIDE_FPS);

export const storyLength = (props: StoryProps) =>
	INTRO +
	props.scenes.reduce(
		(sum, scene) => sum + (scene.card ? TURN : 0) + sceneFrames(scene),
		0,
	) +
	practiceLength(props.practice) +
	END_MARK;

function asGuide(props: StoryProps, scene: StoryScene): GuideProps {
	return {
		shape: props.shape,
		lang: props.lang,
		title: props.title,
		summary: props.summary,
		practice: props.practice,
		ground: "shop",
		look: props.look,
		video: scene.video,
		durationMs: scene.durationMs,
		viewport: scene.viewport,
		size: scene.size,
		// A speed run says one thing for the whole scene.
		steps:
			scene.speed > 1 && scene.caption
				? [
						{
							id: scene.id,
							caption: scene.caption,
							t0: 0,
							t1: scene.durationMs,
							taps: scene.steps.flatMap((s) => s.taps),
							focus: [],
						},
					]
				: scene.steps,
	};
}

/** Which day it is, above the window's corner: quiet, the same pill as the caption. */
function DayChip({
	text,
	fast,
	look,
	top,
	left,
}: {
	text: string;
	fast: boolean;
	look: Look;
	top: number;
	left: number;
}) {
	const size = Math.round(look.captionSize * 0.78);
	return (
		<div
			style={{
				position: "absolute",
				top,
				left,
				transform: "translateY(-50%)",
				display: "flex",
				alignItems: "center",
				gap: size * 0.5,
				padding: `${size * 0.4}px ${size * 0.8}px`,
				borderRadius: size,
				background: `rgb(20 20 18 / ${look.captionCard})`,
				color: "#fff",
				fontFamily: SANS,
				fontWeight: 500,
				fontSize: size,
				lineHeight: 1.2,
				fontVariantNumeric: "tabular-nums",
				whiteSpace: "nowrap",
			}}
		>
			{fast && (
				<svg height={size * 0.8} viewBox="0 0 24 16" width={size * 1.2}>
					<path d="M1 1 L11 8 L1 15 Z M12 1 L22 8 L12 15 Z" fill="#fff" />
				</svg>
			)}
			{text}
		</div>
	);
}

/** The window's place on the frame, the same for every part: the story is one window throughout. */
function windowOf(props: StoryProps) {
	const viewport = props.scenes[0]?.viewport ?? { width: 1440, height: 900 };
	const looked = lookLayout(props.shape, viewport, props.look);
	return { viewport, looked };
}

function SceneView({
	props,
	scene,
	frame,
}: {
	props: StoryProps;
	scene: StoryScene;
	frame: number;
}) {
	const guide = asGuide(props, scene);
	const looked = lookLayout(props.shape, scene.viewport, props.look);
	const l: Layout = {
		...layout(props.shape, scene.viewport),
		box: looked.box,
		radius: looked.radius,
	};
	const recorded = frame * scene.speed;
	// The chip sits in the margin above the window, at its left edge.
	const chipTop = looked.frame.y / 2;
	return (
		<AbsoluteFill>
			<Screen frame={recorded} l={l} props={guide} speed={scene.speed} />
			<LookCaption
				frame={recorded}
				look={props.look}
				maxWidth={looked.captionMax}
				props={guide}
				top={looked.captionTop}
			/>
			<DayChip
				fast={scene.speed > 1}
				left={looked.frame.x}
				look={props.look}
				text={scene.day}
				top={chipTop}
			/>
		</AbsoluteFill>
	);
}

/** A page in the window, for this story's screen. */
function Page({
	props,
	children,
}: {
	props: StoryProps;
	children: React.ReactNode;
}) {
	const { viewport } = windowOf(props);
	return (
		<WindowPage look={props.look} shape={props.shape} viewport={viewport}>
			{children}
		</WindowPage>
	);
}

function Eyebrow({ props, frame }: { props: StoryProps; frame: number }) {
	return <SharedEyebrow frame={frame} lang={props.lang} shape={props.shape} />;
}

/** A turn in the story: its words and the day it has come to. */
function Turn({
	props,
	scene,
	frame,
	fromDay,
}: {
	props: StoryProps;
	scene: StoryScene;
	frame: number;
	/** Its chip's words, swapped for this scene's as the days fill in. */
	fromDay: string;
}) {
	const brand = useBrand();
	const wide = props.shape === "landscape";
	const title = scene.card?.title ?? "";
	// One after another, as they are read: the mark, the title typed, then the day under it.
	const lineIn = 0.5 + typingTime(title) + 0.2;
	return (
		<Page props={props}>
			<Eyebrow frame={frame} props={props} />
			<div
				style={{
					fontSize: wide ? 46 : 52,
					fontWeight: 500,
					letterSpacing: "-0.02em",
					lineHeight: 1.1,
					marginTop: 6,
				}}
			>
				<Typewrite caret={false} delay={0.5} frame={frame} text={title} />
			</div>
			<div
				style={{
					fontSize: wide ? 20 : 24,
					color: brand.colors.ink2,
					fontVariantNumeric: "tabular-nums",
					...rise(frame, Math.round(lineIn * GUIDE_FPS), 12),
				}}
			>
				{fromDay === scene.day ? (
					scene.day
				) : (
					<Swap
						at={lineIn + 0.45}
						frame={frame}
						from={fromDay}
						to={scene.day}
					/>
				)}
			</div>
		</Page>
	);
}

function TitleCard({ props, frame }: { props: StoryProps; frame: number }) {
	const brand = useBrand();
	const wide = props.shape === "landscape";
	return (
		<Page props={props}>
			<Eyebrow frame={frame} props={props} />
			<div
				style={{
					fontSize: wide ? 56 : 60,
					fontWeight: 500,
					letterSpacing: "-0.025em",
					lineHeight: 1.08,
					maxWidth: wide ? "16em" : undefined,
					textWrap: "balance",
					marginTop: 6,
				}}
			>
				<Sweep
					colors={brand.colors.sweep}
					delay={0.2}
					frame={frame}
					text={props.title}
				/>
			</div>
			<div
				style={{
					fontSize: wide ? 22 : 26,
					lineHeight: 1.45,
					color: brand.colors.ink2,
					maxWidth: wide ? "34em" : undefined,
					textWrap: "pretty",
				}}
			>
				<Reveal delay={0.9} frame={frame} text={props.summary} />
			</div>
		</Page>
	);
}

/**
 * How a part comes in and goes out inside the window, which itself never moves: a cut
 * is a dissolve; into a turn the app softens away as the page comes up over it, and out
 * of one the page lifts as the app sharpens back in.
 */
function moving(
	frame: number,
	from: number,
	length: number,
	inFade: number,
	outFade: number,
	kind: "scene" | "card",
): React.CSSProperties {
	const come = ease(clamp01((frame - from) / inFade));
	const go = ease(clamp01((frame - from - length) / outFade));
	const opacity = Math.min(come, 1 - go);
	if (kind === "card") return { opacity };
	const soft = outFade > FADE ? go : 0;
	const near = inFade > FADE ? 1 - come : 0;
	const blur = 8 * soft + 6 * near;
	return { opacity, filter: blur > 0.05 ? `blur(${blur}px)` : undefined };
}

export function Story(props: StoryProps) {
	const brand = props.brand ?? DEFAULT_BRAND;
	useFonts();
	const frame = useCurrentFrame();
	const fade = (value: number, from: number, to: number) =>
		interpolate(value, [from, to], [0, 1], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		});
	const parts: React.ReactNode[] = [];
	let at = INTRO;
	let lastDayText = props.scenes[0]?.day ?? "";
	parts.push(
		<Sequence durationInFrames={INTRO + FADE} key="title">
			<AbsoluteFill style={{ opacity: 1 - fade(frame, INTRO, INTRO + FADE) }}>
				<TitleCard frame={frame} props={props} />
			</AbsoluteFill>
		</Sequence>,
	);
	// What comes in after each part decides how it goes out.
	let inFade = FADE;
	props.scenes.forEach((scene, index) => {
		if (scene.card) {
			const from = at;
			const beforeText = lastDayText;
			parts.push(
				<Sequence
					durationInFrames={TURN + TURN_FADE}
					from={from}
					key={`${scene.id}-turn`}
				>
					<AbsoluteFill
						style={moving(frame, from, TURN, TURN_FADE, TURN_FADE, "card")}
					>
						<Turn
							fromDay={beforeText}
							frame={frame - from}
							props={props}
							scene={scene}
						/>
					</AbsoluteFill>
				</Sequence>,
			);
			at += TURN;
			inFade = TURN_FADE;
		}
		const from = at;
		const length = sceneFrames(scene);
		const outFade = props.scenes[index + 1]?.card ? TURN_FADE : FADE;
		parts.push(
			<Sequence durationInFrames={length + outFade} from={from} key={scene.id}>
				<AbsoluteFill
					style={moving(frame, from, length, inFade, outFade, "scene")}
				>
					<SceneView
						frame={Math.max(0, frame - from)}
						props={props}
						scene={scene}
					/>
				</AbsoluteFill>
			</Sequence>,
		);
		at += length;
		inFade = FADE;
		lastDayText = scene.day;
	});
	const practice = practiceLength(props.practice);
	const end = at;
	const { looked } = windowOf(props);
	// The window comes up with the title and stays, still, until the good practice.
	const windowShown = Math.min(
		ease(clamp01(frame / 14)),
		1 - fade(frame, end, end + FADE),
	);
	parts.unshift(
		<AbsoluteFill key="window" style={{ opacity: windowShown }}>
			<Frame box={looked.frame} look={props.look} />
		</AbsoluteFill>,
	);
	parts.push(
		<Sequence from={end} key="practice">
			<AbsoluteFill style={{ opacity: fade(frame, end, end + FADE) }}>
				<Practice
					frame={frame - end}
					length={practice}
					props={{
						...asGuide(props, props.scenes[0] ?? EMPTY_SCENE),
						ground: "shop",
					}}
				/>
			</AbsoluteFill>
		</Sequence>,
	);
	// One ground under everything: a dissolve between parts never shows through to bare paper.
	return (
		<BrandProvider value={brand}>
			<AbsoluteFill style={{ background: brand.colors.paper }}>
				<Ground name="look" shape={props.shape} />
				{parts}
			</AbsoluteFill>
		</BrandProvider>
	);
}
