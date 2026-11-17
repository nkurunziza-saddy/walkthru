import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
} from "remotion";
import { closingFrames } from "../timeline.ts";
import {
	type Brand,
	BrandProvider,
	DEFAULT_BRAND,
	type Lang,
	Mark,
	useBrand,
	wordsOf,
} from "./brand.tsx";
import { useFonts } from "./fonts.ts";
import { GUIDE_FPS } from "./fps.ts";
import { Reveal, Sweep } from "./text.tsx";

/*
 * A guide film: a topic recorded from the real app (the host's script), with its
 * captions. Nothing here is drawn from the app: the screen is the recording, in a
 * rounded window floating on a soft ground of hills. What is added is a title, a
 * caption for each step, a soft ripple where each tap lands (and, on a desktop, a
 * cursor that goes to each target and settles before it presses), a gentle move in
 * on the part that matters (the app itself is always clean and sharp), a bar of chapters
 * and a note on good practice at the end. Landscape shows the desktop recording
 * alone; upright shows the phone's, with larger words.
 */

export { GUIDE_FPS } from "./fps.ts";
const INTRO = 75;
const FADE = 10;
const END_MARK = 75;

export type Box = { x: number; y: number; w: number; h: number };
export type GuideStep = {
	id: string;
	caption: string;
	t0: number;
	t1: number;
	taps: (Box & { t: number; kind: "tap" | "type" })[];
	focus: Box[];
};
/** The look saved in the Studio's look page: the fields the film uses. */
export type Look = {
	frameWidth: number;
	frameHeight: number;
	innerPad: number;
	frameStyle: "glass" | "solid" | "none";
	frameAlpha: number;
	frameColor: string;
	appRadius: number;
	radius: number;
	shadow: number;
	shadowAlpha: number;
	edge: number;
	caption: boolean;
	captionStyle: "pill" | "light" | "text";
	captionAt: "below" | "over" | "top";
	captionSize: number;
	captionCard: number;
};
export type GuideProps = {
	/** Whose film it is: its name, mark, colours and own words. Left out, a neutral one. */
	brand?: Brand;
	shape: "landscape" | "upright";
	lang: Lang;
	title: string;
	summary: string;
	practice: string;
	/** The picture the window floats on: `ground-<name>-<shape>.png` in the public folder, the host's own. */
	ground: string;
	/** When the Studio has saved a look: its window, caption and background (`ground-look-<shape>.png`) instead of the ground's. */
	look?: Look;
	/** The recording, under the bundle's public folder. */
	video: string;
	durationMs: number;
	viewport: { width: number; height: number };
	size: { width: number; height: number };
	steps: GuideStep[];
};

export const guideLength = (props: GuideProps) =>
	INTRO +
	Math.ceil((props.durationMs / 1000) * GUIDE_FPS) -
	FADE +
	practiceLength(props.practice) +
	END_MARK;

export const practiceLength = (text: string) => closingFrames(text, GUIDE_FPS);

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
/** Both ends eased, no overshoot: how the cursor and the camera move. */
const glide = Easing.bezier(0.45, 0, 0.2, 1);
export const SANS = "'Geist Variable', system-ui, sans-serif";

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** An entry that has to be there (an index found a moment ago). */
function at<T>(list: readonly T[], index: number): T {
	const found = list[index];
	if (found === undefined) throw new Error(`No entry ${index}`);
	return found;
}

export function rise(frame: number, start: number, length = 12) {
	const p = ease(clamp01((frame - start) / length));
	return { opacity: p, transform: `translateY(${(1 - p) * 10}px)` };
}

const WINDOW_SHADOW =
	"0 46px 90px -24px rgb(18 32 22 / 0.5), 0 14px 32px -10px rgb(18 32 22 / 0.32), 0 0 0 1px rgb(0 0 0 / 0.07)";
/** What the words sit on: frosted white, so they read over any part of the ground. */
export const CARD: React.CSSProperties = {
	background: "rgb(255 255 255 / 0.86)",
	backdropFilter: "blur(18px)",
	boxShadow:
		"0 18px 40px -16px rgb(18 32 22 / 0.4), 0 0 0 1px rgb(0 0 0 / 0.09)",
};

/** Where a layout puts the recording on the film: a window with a narrow margin of ground round it. */
export function layout(
	shape: GuideProps["shape"],
	viewport: GuideProps["viewport"],
) {
	if (shape === "landscape") {
		// 4% of the frame's height all round: the app reads at nearly full size.
		const h = 1000;
		const w = Math.round((h * viewport.width) / viewport.height);
		return {
			width: 1920,
			height: 1080,
			box: { x: Math.round((1920 - w) / 2), y: 40, w, h },
			caption: { size: 40, maxWidth: 1240, bottom: 40 + 26, left: 0, right: 0 },
			radius: 20,
		};
	}
	// The phone fills the height; the caption sits above it.
	const h = 1560;
	const w = Math.round((h * viewport.width) / viewport.height);
	return {
		width: 1080,
		height: 1920,
		box: { x: Math.round((1080 - w) / 2), y: 320, w, h },
		caption: { size: 50, maxWidth: 1000, bottom: 0, left: 40, right: 40 },
		radius: 44,
	};
}

/**
 * The same layout as the Studio's look page: the window (frame and the app padded inside it) and
 * the caption below it, as one group in the middle of the frame. The room for the caption
 * is one line's; a longer one grows into the margin.
 */
export function lookLayout(
	shape: GuideProps["shape"],
	viewport: GuideProps["viewport"],
	look: Look,
) {
	const W = shape === "landscape" ? 1920 : 1080;
	const H = shape === "landscape" ? 1080 : 1920;
	const size = look.captionSize;
	const capH = look.caption ? size * 1.35 + size * 1.1 : 0;
	const gap = size * 1.2;
	const beside = look.caption && look.captionAt !== "over" ? capH + gap : 0;
	const pad = look.frameStyle === "none" ? 0 : look.innerPad;
	const maxW = (look.frameWidth / 100) * W;
	const maxH = (look.frameHeight / 100) * H - beside;
	const aspect = viewport.width / viewport.height;
	let appW = maxW - pad * 2;
	let appH = appW / aspect;
	if (appH + pad * 2 > maxH) {
		appH = maxH - pad * 2;
		appW = appH * aspect;
	}
	const fw = appW + pad * 2;
	const fh = appH + pad * 2;
	const fy =
		(H - (fh + beside)) / 2 +
		(look.caption && look.captionAt === "top" ? capH + gap : 0);
	const fx = (W - fw) / 2;
	const captionTop =
		look.captionAt === "below"
			? fy + fh + gap
			: look.captionAt === "top"
				? fy - gap - capH
				: fy + fh - pad - capH - size * 0.6;
	return {
		width: W,
		height: H,
		frame: { x: fx, y: fy, w: fw, h: fh },
		box: { x: fx + pad, y: fy + pad, w: appW, h: appH },
		radius: look.frameStyle === "none" ? look.radius : look.appRadius,
		captionTop,
		captionMax: shape === "landscape" ? W * 0.56 : W * 0.86,
	};
}

export type Layout = ReturnType<typeof layout>;

/** Which step is showing at this time in the recording. */
function stepAt(steps: GuideStep[], ms: number) {
	let found = 0;
	steps.forEach((step, index) => {
		if (ms >= step.t0) found = index;
	});
	return found;
}

const frames = (ms: number) => (ms / 1000) * GUIDE_FPS;

/** How far the film is on a step's focus: 0 off to 1 on, near the end of its step. */
function focusAmount(step: GuideStep, ms: number) {
	if (!step.focus.length) return 0;
	const lastTap = step.taps.reduce(
		(latest, tap) => Math.max(latest, tap.t),
		step.t0,
	);
	const start = lastTap + 250;
	const end = step.t1 - 300;
	if (end - start < 700) return 0;
	const inP = glide(clamp01((frames(ms) - frames(start)) / 18));
	const outP = glide(clamp01((frames(end) - frames(ms)) / 12));
	return Math.min(inP, outP);
}

/** The union of a step's focus boxes, a little roomier, and how far to move in on it (gently, or not at all). */
function focusBox(step: GuideStep, viewport: GuideProps["viewport"]) {
	const x0 = Math.max(0, Math.min(...step.focus.map((b) => b.x)) - 20);
	const y0 = Math.max(0, Math.min(...step.focus.map((b) => b.y)) - 20);
	const x1 = Math.min(
		viewport.width,
		Math.max(...step.focus.map((b) => b.x + b.w)) + 20,
	);
	const y1 = Math.min(
		viewport.height,
		Math.max(...step.focus.map((b) => b.y + b.h)) + 20,
	);
	const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	// Nothing to set apart when it is most of the screen.
	if ((box.w * box.h) / (viewport.width * viewport.height) > 0.6)
		return undefined;
	const fit = Math.min(viewport.width / box.w, viewport.height / box.h) * 0.6;
	const scale = Math.min(1.28, fit);
	return { box, scale: scale < 1.12 ? 1 : scale };
}

type Tap = GuideStep["taps"][number];
const centre = (tap: Box) => ({ x: tap.x + tap.w / 2, y: tap.y + tap.h / 2 });

/** The time the cursor takes between two targets: longer for longer ways, never abrupt. */
const travelMs = (distance: number) =>
	Math.min(980, Math.max(420, 380 + distance * 0.45));
/** It stops this long above a target before it presses. */
const SETTLE = 140;

/**
 * Where the cursor is: made from where each press landed, not from the mouse. From
 * one target to the next along a slight arc, eased at both ends, arriving a moment
 * before the press and keeping still until it.
 */
function cursorAt(taps: Tap[], ms: number, viewport: GuideProps["viewport"]) {
	if (!taps.length) return undefined;
	const next = taps.findIndex((tap) => tap.t + SETTLE > ms);
	const upto = next < 0 ? taps.length - 1 : next;
	const target = centre(at(taps, upto));
	const first = upto === 0;
	const from = first
		? {
				x: Math.min(viewport.width - 20, target.x + 220),
				y: Math.min(viewport.height - 20, target.y + 140),
			}
		: centre(at(taps, upto - 1));
	if (next < 0) return { ...target, visible: 1, press: 0, moving: false };
	const tap = at(taps, upto);
	const previous = first ? undefined : at(taps, upto - 1);
	const distance = Math.hypot(target.x - from.x, target.y - from.y);
	const arrive = tap.t - SETTLE;
	// A short gap leaves a short trip; a long one waits for the last moment to go.
	const earliest = previous ? previous.t + 160 : arrive - 1400;
	const duration = Math.max(
		240,
		Math.min(travelMs(distance), arrive - earliest),
	);
	const p = glide(clamp01((ms - (arrive - duration)) / duration));
	// A quiet arc: the way goes a little to one side of the straight line.
	const bend = Math.sin(p * Math.PI) * distance * 0.06;
	const nx = distance === 0 ? 0 : -(target.y - from.y) / distance;
	const ny = distance === 0 ? 0 : (target.x - from.x) / distance;
	const press = Math.max(0, 1 - Math.abs(ms - tap.t) / 130);
	return {
		x: from.x + (target.x - from.x) * p + nx * bend,
		y: from.y + (target.y - from.y) * p + ny * bend,
		visible: first ? clamp01((ms - (arrive - duration)) / 160) : 1,
		press: ms >= tap.t - 40 ? press : 0,
		moving: p > 0 && p < 1,
	};
}

/**
 * A press, in neutral greys: on a desktop a faint pulse round the cursor, on a phone
 * a small soft dot where the finger touched. Quick (a third of a second), so it is
 * gone before the screen has changed under it.
 */
function Press({
	age,
	phone,
	size,
}: {
	age: number;
	phone: boolean;
	size: number;
}) {
	const life = phone ? 13 : 11;
	if (age < 0 || age > life) return null;
	const p = clamp01(age / life);
	const grow = ease(p);
	// On a desktop only a hint: a person sees the screen answer, not a ring.
	const d = phone ? size * (0.55 + 0.45 * grow) : size * (0.5 + 0.3 * grow);
	return (
		<div
			style={{
				position: "absolute",
				left: -d / 2,
				top: -d / 2,
				width: d,
				height: d,
				borderRadius: "50%",
				background: phone ? "rgb(40 40 40 / 0.2)" : "rgb(255 255 255 / 0.34)",
				border: `${phone ? 3 : 2}px solid ${phone ? "rgb(255 255 255 / 0.75)" : "rgb(70 70 70 / 0.28)"}`,
				opacity: (1 - p) * (phone ? 1 : 0.5),
			}}
		/>
	);
}

function Cursor({
	x,
	y,
	size,
	press,
}: {
	x: number;
	y: number;
	size: number;
	press: number;
}) {
	return (
		<svg
			height={size}
			style={{
				position: "absolute",
				left: x - size * 0.17,
				top: y - size * 0.08,
				transform: `scale(${1 - 0.14 * press})`,
				transformOrigin: "17% 8%",
				filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.3))",
			}}
			viewBox="0 0 24 24"
			width={size}
		>
			<path
				d="M4 2 L4 19 L8.6 14.9 L11.6 21.6 L14.2 20.4 L11.3 13.9 L17.5 13.6 Z"
				fill="#161616"
				stroke="#fff"
				strokeLinejoin="round"
				strokeWidth={1}
			/>
		</svg>
	);
}

/** The recording with what is added to it: ripples, the cursor on a desktop, the move in, the part set apart. */
export function Screen({
	props,
	frame,
	l,
	speed = 1,
}: {
	props: GuideProps;
	frame: number;
	l: Layout;
	/** Played faster than it was recorded (a story's speed run): `frame` is then the recording's frame. */
	speed?: number;
}) {
	const ms = (frame / GUIDE_FPS) * 1000;
	const step = at(props.steps, stepAt(props.steps, ms));
	const k = l.box.w / props.viewport.width;
	const amount = focusAmount(step, ms);
	const focus = amount > 0 ? focusBox(step, props.viewport) : undefined;
	let tx = 0;
	let ty = 0;
	let scale = 1;
	if (focus) {
		scale = 1 + (focus.scale - 1) * amount;
		const cx = (focus.box.x + focus.box.w / 2) * k;
		const cy = (focus.box.y + focus.box.h / 2) * k;
		tx = Math.min(
			0,
			Math.max(l.box.w - l.box.w * scale, l.box.w / 2 - cx * scale),
		);
		ty = Math.min(
			0,
			Math.max(l.box.h - l.box.h * scale, l.box.h / 2 - cy * scale),
		);
	}
	const allTaps = props.steps.flatMap((s) => s.taps);
	const desktop = props.shape === "landscape";
	const cursor = desktop ? cursorAt(allTaps, ms, props.viewport) : undefined;
	return (
		<div
			style={{
				position: "absolute",
				left: l.box.x,
				top: l.box.y,
				width: l.box.w,
				height: l.box.h,
				borderRadius: l.radius,
				overflow: "hidden",
				background: "#fff",
				boxShadow: props.look ? undefined : WINDOW_SHADOW,
			}}
		>
			<div
				style={{
					position: "absolute",
					inset: 0,
					transformOrigin: "0 0",
					transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
				}}
			>
				<OffthreadVideo
					playbackRate={speed}
					src={staticFile(props.video)}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
					}}
				/>
				{allTaps.map((tap, i) => {
					const age = frame - frames(tap.t);
					if (age < 0 || age > 14) return null;
					const c = centre(tap);
					return (
						<div
							key={i}
							style={{ position: "absolute", left: c.x * k, top: c.y * k }}
						>
							<Press age={age} phone={!desktop} size={desktop ? 60 : 78} />
						</div>
					);
				})}
				{cursor && (
					<div style={{ opacity: cursor.visible }}>
						<Cursor
							press={cursor.press}
							size={32}
							x={cursor.x * k}
							y={cursor.y * k}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

/** The caption of the step showing, on a frosted card, with one segment for each step beneath it: the chapters. */
function CaptionCard({
	props,
	frame,
	l,
}: {
	props: GuideProps;
	frame: number;
	l: Layout;
}) {
	const brand = useBrand();
	const ms = (frame / GUIDE_FPS) * 1000;
	const index = stepAt(props.steps, ms);
	const step = at(props.steps, index);
	const start = (step.t0 / 1000) * GUIDE_FPS;
	const wide = props.shape === "landscape";
	return (
		<div
			style={{
				position: "absolute",
				left: l.caption.left,
				right: l.caption.right,
				...(wide ? { bottom: l.caption.bottom } : { top: 40 }),
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					...CARD,
					borderRadius: wide ? 22 : 30,
					padding: wide ? "20px 36px 18px" : "26px 36px 22px",
					maxWidth: l.caption.maxWidth,
					width: wide ? "fit-content" : "100%",
					display: "flex",
					flexDirection: "column",
					gap: wide ? 14 : 18,
					fontFamily: SANS,
				}}
			>
				<div
					key={step.id}
					style={{
						fontWeight: 500,
						fontSize: l.caption.size,
						lineHeight: 1.2,
						letterSpacing: "-0.01em",
						color: brand.colors.ink,
						textWrap: "balance",
						textAlign: wide ? "center" : "left",
						...rise(frame, start + 2),
					}}
				>
					{step.caption}
				</div>
				<div style={{ display: "flex", gap: 6 }}>
					{props.steps.map((other, i) => {
						const span = Math.max(
							1,
							(props.steps[i + 1]?.t0 ?? props.durationMs) - other.t0,
						);
						const done =
							i < index ? 1 : i === index ? clamp01((ms - other.t0) / span) : 0;
						return (
							<div
								key={other.id}
								style={{
									flex: 1,
									height: 5,
									borderRadius: 3,
									background: "rgb(0 0 0 / 0.1)",
									overflow: "hidden",
								}}
							>
								<div
									style={{
										width: `${done * 100}%`,
										height: "100%",
										background: brand.colors.ink,
									}}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** The frame the app sits in, as the Studio's look page draws it: frosted glass (or solid) with its shadow; no border unless the look has an edge. */
export function Frame({ look, box }: { look: Look; box: Box }) {
	if (look.frameStyle === "none")
		return (
			<div
				style={{
					position: "absolute",
					left: box.x,
					top: box.y,
					width: box.w,
					height: box.h,
					borderRadius: look.radius,
					boxShadow: `0 ${look.shadow * 0.3}px ${look.shadow}px rgb(0 0 0 / ${look.shadowAlpha})`,
				}}
			/>
		);
	const rgb = [1, 3, 5].map((i) =>
		Number.parseInt(look.frameColor.slice(i, i + 2), 16),
	);
	const alpha = look.frameStyle === "solid" ? 1 : look.frameAlpha;
	const shadows = [
		`0 ${look.shadow * 0.3}px ${look.shadow}px rgb(0 0 0 / ${look.shadowAlpha})`,
	];
	if (look.edge > 0)
		shadows.push(
			`inset 0 0 0 1.5px rgb(255 255 255 / ${Math.min(1, look.edge * 3)})`,
		);
	return (
		<div
			style={{
				position: "absolute",
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				borderRadius: look.radius,
				overflow: "hidden",
				background: `rgb(${rgb.join(" ")} / ${alpha})`,
				backdropFilter:
					look.frameStyle === "glass" ? "blur(24px) saturate(1.2)" : undefined,
				boxShadow: shadows.join(", "),
			}}
		/>
	);
}

/** The caption of the step showing, in the look's style: a slim dark pill (or light, or text alone). */
export function LookCaption({
	props,
	look,
	frame,
	top,
	maxWidth,
}: {
	props: GuideProps;
	look: Look;
	frame: number;
	top: number;
	maxWidth: number;
}) {
	if (!look.caption) return null;
	const ms = (frame / GUIDE_FPS) * 1000;
	const step = at(props.steps, stepAt(props.steps, ms));
	const start = (step.t0 / 1000) * GUIDE_FPS;
	const size = look.captionSize;
	const card =
		look.captionStyle === "pill"
			? `rgb(20 20 18 / ${look.captionCard})`
			: look.captionStyle === "light"
				? `rgb(255 255 255 / ${look.captionCard})`
				: undefined;
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				top,
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				key={step.id}
				style={{
					maxWidth,
					padding: `${size * 0.55}px ${size * 0.95}px`,
					borderRadius: size * 1.1,
					background: card,
					boxShadow: card ? "0 8px 30px rgb(0 0 0 / 0.18)" : undefined,
					color: look.captionStyle === "light" ? "#1c1c1a" : "#fff",
					textShadow:
						look.captionStyle === "text"
							? "0 0 12px rgb(0 0 0 / 0.45)"
							: undefined,
					fontFamily: SANS,
					fontWeight: 500,
					fontSize: size,
					lineHeight: 1.35,
					textAlign: "center",
					textWrap: "balance",
					...rise(frame, start + 2),
				}}
			>
				{step.caption}
			</div>
		</div>
	);
}

/** The ground: the picture made once for this shape, `ground-<name>-<shape>.png` in the public folder. */
export function Ground({
	shape,
	name,
}: {
	shape: GuideProps["shape"];
	name: GuideProps["ground"] | "look";
}) {
	return (
		<Img
			src={staticFile(`ground-${name}-${shape}.png`)}
			style={{
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				objectFit: "cover",
			}}
		/>
	);
}

export function Words({
	children,
	wide,
	frame,
}: {
	children: React.ReactNode;
	wide: boolean;
	frame: number;
}) {
	const brand = useBrand();
	return (
		<AbsoluteFill
			style={{
				justifyContent: "center",
				alignItems: wide ? "flex-start" : "center",
				padding: wide ? "0 150px" : "0 60px",
			}}
		>
			<div
				style={{
					...CARD,
					borderRadius: wide ? 32 : 40,
					padding: wide ? "56px 68px" : "64px 56px",
					maxWidth: wide ? 1240 : 960,
					fontFamily: SANS,
					color: brand.colors.ink,
					display: "flex",
					flexDirection: "column",
					gap: wide ? 26 : 36,
					...rise(frame, 0, 14),
				}}
			>
				{children}
			</div>
		</AbsoluteFill>
	);
}

function TitleCard({ props, frame }: { props: GuideProps; frame: number }) {
	const brand = useBrand();
	const wide = props.shape === "landscape";
	if (props.look)
		return (
			<AbsoluteFill>
				<WindowPage
					look={props.look}
					shape={props.shape}
					viewport={props.viewport}
				>
					<Eyebrow frame={frame} lang={props.lang} shape={props.shape} />
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
					<div
						style={{
							fontSize: wide ? 18 : 22,
							color: brand.colors.ink3,
							...rise(frame, 30, 12),
						}}
					>
						{wordsOf(brand, props.lang).steps.replace(
							"{n}",
							String(props.steps.length),
						)}
					</div>
				</WindowPage>
			</AbsoluteFill>
		);
	return (
		<AbsoluteFill>
			<Ground name={props.look ? "look" : props.ground} shape={props.shape} />
			<Words frame={frame} wide={wide}>
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<Mark size={wide ? 44 : 56} />
					<span
						style={{
							fontSize: wide ? 28 : 34,
							fontWeight: 500,
							color: brand.colors.accentInk,
						}}
					>
						{brand.name} · {wordsOf(brand, props.lang).guide}
					</span>
				</div>
				<div
					style={{
						fontSize: wide ? 96 : 100,
						fontWeight: 500,
						letterSpacing: "-0.03em",
						lineHeight: 1.05,
						textWrap: "balance",
					}}
				>
					{props.title}
				</div>
				<div
					style={{
						fontSize: wide ? 38 : 44,
						lineHeight: 1.3,
						color: brand.colors.ink2,
						textWrap: "pretty",
					}}
				>
					{props.summary}
				</div>
				<div style={{ fontSize: wide ? 28 : 34, color: brand.colors.ink3 }}>
					{wordsOf(brand, props.lang).steps.replace(
						"{n}",
						String(props.steps.length),
					)}
				</div>
			</Words>
		</AbsoluteFill>
	);
}

export function Practice({
	props,
	frame,
	length,
}: {
	props: GuideProps;
	frame: number;
	length: number;
}) {
	const brand = useBrand();
	const wide = props.shape === "landscape";
	const toMark = clamp01((frame - length) / 14);
	const page = props.look ? (
		<>
			<Frame
				box={lookLayout(props.shape, props.viewport, props.look).frame}
				look={props.look}
			/>
			<WindowPage
				look={props.look}
				shape={props.shape}
				viewport={props.viewport}
			>
				<Eyebrow
					frame={frame}
					lang={props.lang}
					shape={props.shape}
					text={wordsOf(brand, props.lang).goodPractice}
				/>
				<div
					style={{
						fontSize: wide ? 36 : 40,
						lineHeight: 1.3,
						fontWeight: 500,
						letterSpacing: "-0.015em",
						maxWidth: wide ? "24em" : undefined,
						textWrap: "pretty",
						marginTop: 6,
					}}
				>
					<Reveal delay={0.3} frame={frame} text={props.practice} />
				</div>
			</WindowPage>
		</>
	) : null;
	return (
		<AbsoluteFill>
			<Ground name={props.look ? "look" : props.ground} shape={props.shape} />
			<AbsoluteFill style={{ opacity: 1 - toMark }}>
				{page ?? (
					<Words frame={frame} wide={wide}>
						<div
							style={{
								fontSize: wide ? 30 : 38,
								fontWeight: 500,
								color: brand.colors.accentInk,
							}}
						>
							{wordsOf(brand, props.lang).goodPractice}
						</div>
						<div
							style={{
								fontSize: wide ? 54 : 62,
								lineHeight: 1.25,
								fontWeight: 500,
								letterSpacing: "-0.015em",
								textWrap: "pretty",
							}}
						>
							{props.practice}
						</div>
					</Words>
				)}
			</AbsoluteFill>
			<AbsoluteFill
				style={{
					alignItems: "center",
					justifyContent: "center",
					opacity: toMark,
				}}
			>
				<div
					style={{
						...CARD,
						borderRadius: 36,
						padding: "48px 72px",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 22,
						fontFamily: SANS,
					}}
				>
					<Mark size={wide ? 96 : 120} />
					<div style={{ fontSize: wide ? 34 : 40, color: brand.colors.ink2 }}>
						{wordsOf(brand, props.lang).more}
					</div>
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
}

export function Guide(props: GuideProps) {
	const brand = props.brand ?? DEFAULT_BRAND;
	useFonts();
	const frame = useCurrentFrame();
	const looked = props.look
		? lookLayout(props.shape, props.viewport, props.look)
		: undefined;
	const l: Layout = looked
		? {
				...layout(props.shape, props.viewport),
				box: looked.box,
				radius: looked.radius,
			}
		: layout(props.shape, props.viewport);
	const videoFrames = Math.ceil((props.durationMs / 1000) * GUIDE_FPS);
	const practice = practiceLength(props.practice);
	const f = frame - INTRO;
	const opacity = (value: number, from: number, to: number) =>
		interpolate(value, [from, to], [0, 1], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		});
	const videoShown = Math.min(
		opacity(f, 0, FADE),
		1 - opacity(f, videoFrames - FADE, videoFrames),
	);
	// In the look, one ground and one still window under the title and the app: only what is in it changes.
	const still = looked ? props.look : undefined;
	return (
		<BrandProvider value={brand}>
			<AbsoluteFill style={{ background: brand.colors.paper }}>
				{still && looked && (
					<Sequence durationInFrames={INTRO + videoFrames}>
						<Ground name="look" shape={props.shape} />
						<AbsoluteFill style={{ opacity: Math.min(1, frame / 14) }}>
							<Frame box={looked.frame} look={still} />
						</AbsoluteFill>
					</Sequence>
				)}
				<Sequence durationInFrames={INTRO + FADE}>
					<AbsoluteFill
						style={{ opacity: 1 - opacity(frame, INTRO, INTRO + FADE) }}
					>
						<TitleCard frame={frame} props={props} />
					</AbsoluteFill>
				</Sequence>
				<Sequence durationInFrames={videoFrames} from={INTRO}>
					<AbsoluteFill style={{ opacity: videoShown }}>
						{!still && <Ground name={props.ground} shape={props.shape} />}
						<Screen frame={Math.max(0, f)} l={l} props={props} />
						{props.look && looked ? (
							<LookCaption
								frame={Math.max(0, f)}
								look={props.look}
								maxWidth={looked.captionMax}
								props={props}
								top={looked.captionTop}
							/>
						) : (
							<CaptionCard frame={Math.max(0, f)} l={l} props={props} />
						)}
					</AbsoluteFill>
				</Sequence>
				<Sequence from={INTRO + videoFrames - FADE}>
					<AbsoluteFill
						style={{
							opacity: opacity(
								frame,
								INTRO + videoFrames - FADE,
								INTRO + videoFrames,
							),
						}}
					>
						<Practice
							frame={frame - (INTRO + videoFrames - FADE)}
							length={practice}
							props={props}
						/>
					</AbsoluteFill>
				</Sequence>
			</AbsoluteFill>
		</BrandProvider>
	);
}

/*
 * The cards of a film in the saved look (guide/look.json): a page in the window
 * where the app would be, the same size and corners, white, the words set small and
 * calm at its upper left as on a page of the app, not a slide. The window itself is
 * drawn by the film, once, so it stays still while the page and the app take turns.
 */

/** Where the app sits in the window, for this shape and screen. */
export function windowBox(
	shape: GuideProps["shape"],
	viewport: GuideProps["viewport"],
	look: Look,
) {
	return lookLayout(shape, viewport, look);
}

export function WindowPage({
	shape,
	viewport,
	look,
	children,
}: {
	shape: GuideProps["shape"];
	viewport: GuideProps["viewport"];
	look: Look;
	children: React.ReactNode;
}) {
	const brand = useBrand();
	const looked = windowBox(shape, viewport, look);
	const box = looked.box;
	const wide = shape === "landscape";
	return (
		<div
			style={{
				position: "absolute",
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				borderRadius: looked.radius,
				overflow: "hidden",
				background: brand.colors.page,
				fontFamily: SANS,
				color: brand.colors.ink,
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				padding: `0 ${Math.round(box.w * (wide ? 0.09 : 0.1))}px`,
				gap: wide ? 18 : 22,
			}}
		>
			{children}
		</div>
	);
}

/** The small line over a page's title: the mark and where it is from. */
export function Eyebrow({
	shape,
	lang,
	frame,
	text,
}: {
	shape: GuideProps["shape"];
	lang: Lang;
	frame: number;
	text?: string;
}) {
	const brand = useBrand();
	const wide = shape === "landscape";
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				...rise(frame, 0, 12),
			}}
		>
			<Mark size={wide ? 26 : 30} />
			<span
				style={{
					fontSize: wide ? 18 : 22,
					fontWeight: 500,
					color: brand.colors.accentInk,
				}}
			>
				{text ?? `${brand.name} · ${wordsOf(brand, lang).guide}`}
			</span>
		</div>
	);
}
