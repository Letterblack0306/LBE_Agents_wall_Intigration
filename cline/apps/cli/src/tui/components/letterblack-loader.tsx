import { useEffect, useState } from "react";

const LOADER_STYLES = {
	pipe: ["|", "||", "|||", "////", "/////", "////", "//", "/"],
	dots: ["", ".", "..", "..."],
	wave: ["~", "~", "~~", "~~~", "~~~~", "~~~~~"],
	blocks: ["▖", "▘", "▝", "▗"],
	arc: ["◐", "◓", "◑", "◒"],
	pulse: ["●", "○", "◎", "○"],
	square: ["■", "□", "▪", "▫"],
} as const;

export type LoaderStyle = keyof typeof LOADER_STYLES;

interface LetterblackLoaderProps {
	color?: string;
	style?: LoaderStyle;
	speed?: "slow" | "normal" | "fast";
	showProgress?: boolean;
	progress?: number;
}

const SPEED_MAP = { slow: 150, normal: 90, fast: 50 };

export function LetterblackLoader(props: LetterblackLoaderProps) {
	const [frame, setFrame] = useState(0);
	const [visible, setVisible] = useState(true);
	const { color = "white", style = "pipe", speed = "normal", showProgress = false, progress } = props;
	const frames = LOADER_STYLES[style];
	const interval = SPEED_MAP[speed];

	useEffect(() => {
		const id = setInterval(() => setFrame((c) => (c + 1) % frames.length), interval);
		return () => clearInterval(id);
	}, [interval, frames.length]);

	useEffect(() => {
		if (style === "pulse" || style === "wave") {
			const fadeId = setInterval(() => setVisible((v) => !v), interval * 3);
			return () => clearInterval(fadeId);
		}
		return () => {};
	}, [style, interval]);

	const progressText = showProgress && progress !== undefined ? ` ${Math.round(progress * 100)}%` : "";
	return (
		<box width="100%" justifyContent="center">
			<text fg={color} opacity={visible || style === "pipe" ? 100 : 70}>
				[{frames[frame]}{progressText}]
			</text>
		</box>
	);
}

export function TypewriterLoader(props: { text: string; color?: string; speed?: "slow" | "normal" | "fast" }) {
	const { text, color = "white", speed = "normal" } = props;
	const [displayed, setDisplayed] = useState("");
	const [done, setDone] = useState(false);
	const charDelay = { slow: 80, normal: 40, fast: 15 }[speed];

	useEffect(() => {
		setDisplayed(""); setDone(false); let i = 0;
		const id = setInterval(() => {
			if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
			else { clearInterval(id); setDone(true); }
		}, charDelay);
		return () => clearInterval(id);
	}, [text, charDelay]);

	return (
		<box justifyContent="center">
			<text fg={color}>{displayed}{!done && "█"}</text>
		</box>
	);
}

export function ProgressBarLoader(props: { progress: number; width?: number; color?: string; trackColor?: string }) {
	const { progress, width = 20, color = "green", trackColor = "gray" } = props;
	const filled = Math.round(progress * width);
	return (
		<box justifyContent="center">
			<text fg={trackColor}>[</text><text fg={color}>{"█".repeat(filled)}{"░".repeat(width - filled)}</text>
			<text fg={trackColor}>]</text><text fg={color}> {Math.round(progress * 100)}%</text>
		</box>
	);
}

const SPIN_FRAMES = ["◢", "◣", "◤", "◥", "◢"];
export function SpinningIndicator(props: { color?: string; size?: number }) {
	const { color = "white", size = 1 } = props;
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setFrame((f) => (f + 1) % SPIN_FRAMES.length), 80);
		return () => clearInterval(id);
	}, []);
	return <text fg={color}>{SPIN_FRAMES[frame].repeat(size)}</text>;
}

export function PulsingDot(props: { color?: string }) {
	const { color = "white" } = props;
	const [scale, setScale] = useState(1);
	useEffect(() => {
		let growing = true;
		const id = setInterval(() => {
			setScale((s) => {
				if (growing) { if (s >= 2) growing = false; return s + 0.2; }
				else { if (s <= 0.6) growing = true; return s - 0.2; }
			});
		}, 100);
		return () => clearInterval(id);
	}, []);
	return <text fg={color}>{"●".repeat(Math.max(1, Math.round(scale)))}</text>;
}

export function AnimatedDots(props: { color?: string; count?: number; stagger?: number }) {
	const { color = "gray", count = 3, stagger = 150 } = props;
	const [visible, setVisible] = useState(0);
	useEffect(() => {
		let i = 0;
		const id = setInterval(() => { i = (i + 1) % (count + 1); setVisible(i); }, stagger);
		return () => clearInterval(id);
	}, [count, stagger]);
	return <text fg={color}>{"●".repeat(visible)}{"○".repeat(count - visible)}</text>;
}
