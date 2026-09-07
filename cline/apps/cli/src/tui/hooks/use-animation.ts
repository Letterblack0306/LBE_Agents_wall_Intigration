import { useCallback, useEffect, useRef, useState } from "react";

export function useAnimatedMount(duration = 300, delay = 0) {
	const [mounted, setMounted] = useState(false);
	const [opacity, setOpacity] = useState(0);

	useEffect(() => {
		const delayId = setTimeout(() => setMounted(true), delay);
		return () => clearTimeout(delayId);
	}, [delay]);

	useEffect(() => {
		if (!mounted) return;
		const step = 100 / duration;
		const id = setInterval(() => {
			setOpacity((o) => {
				if (o >= 100) { clearInterval(id); return 100; }
				return Math.min(100, o + step * 20);
			});
		}, 20);
		return () => clearInterval(id);
	}, [mounted, duration]);

	return { opacity, mounted };
}

export function useTypewriter(text: string, speed = 40, startImmediately = true) {
	const [displayed, setDisplayed] = useState("");
	const [done, setDone] = useState(false);
	const indexRef = useRef(0);

	const start = useCallback(() => {
		setDisplayed("");
		setDone(false);
		indexRef.current = 0;
	}, []);

	useEffect(() => {
		if (!startImmediately) return;
		start();
	}, [text, startImmediately]);

	useEffect(() => {
		if (!startImmediately && displayed === "" && indexRef.current === 0) {
			const id = setInterval(() => {
				if (indexRef.current < text.length) {
					indexRef.current++;
					setDisplayed(text.slice(0, indexRef.current));
				} else {
					clearInterval(id);
					setDone(true);
				}
			}, speed);
			return () => clearInterval(id);
		}
		return;
	}, [startImmediately, text, speed, displayed]);

	return { displayed, done, start };
}

export function usePulse(min = 0.6, max = 1.4, speed = 100) {
	const [scale, setScale] = useState(1);

	useEffect(() => {
		let growing = true;
		const id = setInterval(() => {
			setScale((s) => {
				if (growing) { if (s >= max) growing = false; return s + 0.1; }
				else { if (s <= min) growing = true; return s - 0.1; }
			});
		}, speed);
		return () => clearInterval(id);
	}, [min, max, speed]);

	return scale;
}

export function useShimmer(length = 20) {
	const [position, setPosition] = useState(0);

	useEffect(() => {
		const id = setInterval(() => {
			setPosition((p) => (p + 1) % length);
		}, 80);
		return () => clearInterval(id);
	}, [length]);

	return Array.from({ length }, (_, i) => {
		const dist = Math.abs(i - position);
		return dist < 3 ? 100 : dist < 6 ? 60 : 30;
	});
}

export function useBounce(trigger: boolean, intensity = 3) {
	const [offset, setOffset] = useState(0);

	useEffect(() => {
		if (!trigger) { setOffset(0); return; }
		let frame = 0;
		const animate = () => {
			frame++;
			const bounce = Math.sin(frame * 0.3) * intensity * Math.exp(-frame * 0.05);
			setOffset(bounce);
			if (frame < 30) setTimeout(animate, 16);
			else setOffset(0);
		};
		setTimeout(animate, 16);
		return () => { frame = 100; };
	}, [trigger, intensity]);

	return offset;
}

export function useSequence(durations: number[]) {
	const [step, setStep] = useState(-1);
	const [progress, setProgress] = useState(0);

	const start = useCallback(() => {
		setStep(0);
		setProgress(0);
	}, []);

	useEffect(() => {
		if (step < 0 || step >= durations.length) return;
		const startTime = Date.now();
		const totalDuration = durations[step];

		const id = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const p = Math.min(1, elapsed / totalDuration);
			setProgress(p);
			if (p >= 1) {
				clearInterval(id);
				if (step < durations.length - 1) setStep(step + 1);
				else setStep(-1);
			}
		}, 16);

		return () => clearInterval(id);
	}, [step, durations]);

	return { step, progress, isComplete: step === -1, start };
}
