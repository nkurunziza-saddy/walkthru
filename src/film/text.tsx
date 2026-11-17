import { Easing } from "remotion";
import { GUIDE_FPS } from "./fps.ts";

/*
 * Text that moves on the cards between scenes, frame by frame. These are ported from
 * Mizzle's text components (packages/react/components/text) with their timings and
 * curves: TextReveal ("rise", by words), Typewriter (each character fades in, with
 * a steady jitter and a pause after punctuation, then a caret that blinks), TextSwap
 * ("lift") and SweepText (an ink edge sweeps the words in). Every frame is a pure
 * function of the frame number, so the film renders the same each time.
 */

const OUT = Easing.bezier(0.22, 1, 0.36, 1);
const IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);
const SWEEP = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const frames = (seconds: number) => seconds * GUIDE_FPS;

/** TextReveal, "rise" by words: 0.5 s each, 0.04 s apart, from 0.35em below and 0.1em of blur. */
export function Reveal({
	text,
	frame,
	delay = 0,
	stagger = 0.04,
	duration = 0.5,
}: {
	text: string;
	frame: number;
	/** Seconds. */
	delay?: number;
	stagger?: number;
	duration?: number;
}) {
	const words = text.split(/\s+/).filter(Boolean);
	return (
		<span>
			{words.map((word, index) => {
				const p = OUT(
					clamp((frame - frames(delay + index * stagger)) / frames(duration)),
				);
				return (
					<span key={index}>
						{index > 0 && " "}
						<span
							style={{
								display: "inline-block",
								opacity: p,
								transform: `translateY(${(1 - p) * 0.35}em)`,
								filter: p < 1 ? `blur(${(1 - p) * 0.1}em)` : undefined,
							}}
						>
							{word}
						</span>
					</span>
				);
			})}
		</span>
	);
}

/** A steady stand-in for the typewriter's random jitter: the same text types the same each time. */
function jitter(index: number) {
	const x = Math.sin(index * 12.9898 + 78.233) * 43_758.5453;
	return x - Math.floor(x) - 0.5;
}

/** When each character of `text` is typed, in seconds from the start: Typewriter's speed, jitter and punctuation pause. */
function typedAt(text: string, speed: number) {
	const times: number[] = [];
	let at = 0;
	for (let index = 0; index < text.length; index++) {
		const before = text.charAt(index - 1);
		at +=
			speed * (1 + jitter(index) * 0.66) * (/[.,!?;:]/.test(before) ? 5 : 1);
		times.push(at);
	}
	return times;
}

/** How long `text` takes to type, in seconds. */
export const typingTime = (text: string, speed = 0.055) =>
	typedAt(text, speed).at(-1) ?? 0;

/** Typewriter: each character fades in from 0.12em of blur over 0.3 s; the caret follows, then blinks. */
export function Typewrite({
	text,
	frame,
	delay = 0,
	speed = 0.055,
	caret = true,
}: {
	text: string;
	frame: number;
	delay?: number;
	speed?: number;
	caret?: boolean;
}) {
	const times = typedAt(text, speed);
	const now = frame / GUIDE_FPS - delay;
	const typed = times.filter((at) => at <= now).length;
	const done = now - (times.at(-1) ?? 0);
	// 1.2 s blink once the line is typed: on 0–35 %, fading out to 55 %, off to 80 %, back.
	const phase = done > 0 ? (done % 1.2) / 1.2 : 0;
	const blink =
		phase <= 0.35
			? 1
			: phase <= 0.55
				? 1 - (phase - 0.35) / 0.2
				: phase <= 0.8
					? 0
					: (phase - 0.8) / 0.2;
	const bar = (
		<span
			style={{
				position: "relative",
				display: "inline-block",
				width: 0,
				height: "1em",
			}}
		>
			<span
				style={{
					position: "absolute",
					left: "0.06em",
					top: "50%",
					height: "1.05em",
					width: "max(2px, 0.055em)",
					borderRadius: 999,
					background: "currentColor",
					transform: "translateY(-50%)",
					opacity: now < 0 ? 0 : blink,
				}}
			/>
		</span>
	);
	return (
		<span style={{ whiteSpace: "pre-wrap" }}>
			{Array.from(text, (char, index) => {
				const p = OUT(clamp((now - (times[index] ?? 0)) / 0.3));
				return (
					<span key={index}>
						<span
							style={{
								opacity: p,
								filter: p < 1 ? `blur(${(1 - p) * 0.12}em)` : undefined,
							}}
						>
							{char}
						</span>
						{caret && index === Math.max(0, typed - 1) && typed > 0 && bar}
					</span>
				);
			})}
			{caret && typed === 0 && (
				<span style={{ position: "relative" }}>{bar}</span>
			)}
		</span>
	);
}

/** TextSwap, "lift": the old text lifts and blurs away over 150 ms, the new rises in after 70 % of that. */
export function Swap({
	from,
	to,
	frame,
	at,
	duration = 0.15,
}: {
	from: string;
	to: string;
	frame: number;
	/** Seconds: when the swap starts. */
	at: number;
	duration?: number;
}) {
	const t = frame / GUIDE_FPS - at;
	const out = IN_OUT(clamp(t / duration));
	const come = IN_OUT(clamp((t - duration * 0.7) / duration));
	const piece = (p: number, rising: boolean): React.CSSProperties => ({
		gridArea: "1 / 1",
		whiteSpace: "nowrap",
		opacity: rising ? p : 1 - p,
		transform: `translateY(${rising ? (1 - p) * 0.25 : -p * 0.25}em)`,
		filter:
			(rising ? 1 - p : p) > 0.01
				? `blur(${(rising ? 1 - p : p) * 2}px)`
				: undefined,
	});
	return (
		<span style={{ display: "inline-grid" }}>
			{t < duration && <span style={piece(out, false)}>{from}</span>}
			<span
				style={
					t < 0
						? { gridArea: "1 / 1", visibility: "hidden" }
						: piece(come, true)
				}
			>
				{to}
			</span>
		</span>
	);
}

/**
 * SweepText: the words are drawn in from the left by a soft ink edge in the given
 * colours, over 1.5 s. The gradient is ink for its first third, the colours across the
 * next ninth, then clear; it slides from 67 % to 0 %.
 */
export function Sweep({
	text,
	frame,
	colors,
	delay = 0,
	duration = 1.5,
}: {
	text: string;
	frame: number;
	colors: string[];
	delay?: number;
	duration?: number;
}) {
	const start = 100 / 3;
	const end = start + 34 / 3;
	const stops = colors.map((color, index) => {
		const at =
			colors.length === 1
				? (start + end) / 2
				: start + (index / (colors.length - 1)) * (end - start);
		return `${color} ${at.toFixed(2)}%`;
	});
	const image = `linear-gradient(90deg, currentColor 0%, currentColor ${start.toFixed(2)}%, ${stops.join(", ")}, transparent ${end.toFixed(2)}%)`;
	// The edge reads the words in order, one line after the next, not every line at
	// once: it moves through the characters, and each word is drawn as it passes.
	const words = text.split(/(\s+)/);
	const letters = text.replace(/\s+/g, "").length || 1;
	const front = SWEEP(clamp((frame / GUIDE_FPS - delay) / duration)) * letters;
	let before = 0;
	return (
		<>
			{words.map((word, index) => {
				if (/^\s+$/.test(word) || word === "") return word;
				const p = clamp((front - before) / word.length);
				before += word.length;
				return (
					<span
						key={index}
						style={{
							display: "inline-block",
							backgroundImage: image,
							backgroundSize: "300% 100%",
							backgroundPositionX: `${67 * (1 - p)}%`,
							WebkitBackgroundClip: "text",
							backgroundClip: "text",
							WebkitTextFillColor: "transparent",
							// The ink edge needs room past the last letter's overhang.
							paddingRight: "0.08em",
							marginRight: "-0.08em",
						}}
					>
						{word}
					</span>
				);
			})}
		</>
	);
}
