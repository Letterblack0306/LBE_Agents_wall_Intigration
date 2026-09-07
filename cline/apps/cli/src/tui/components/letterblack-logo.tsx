import { useEffect, useState } from "react";
import { useTheme } from "../hooks/use-theme";

export interface AnimatedLetterblackLogoProps {
	animate?: boolean;
	delay?: number;
}

export function LetterblackLogo(props: AnimatedLetterblackLogoProps) {
	const { animate = true, delay = 0 } = props;
	const theme = useTheme();
	const foreground = theme.defaultForeground;
	const [opacity, setOpacity] = useState(animate ? 0 : 100);

	useEffect(() => {
		if (!animate) { setOpacity(100); return; }
		const id = setTimeout(() => {
			const fadeId = setInterval(() => {
				setOpacity((o) => {
					if (o >= 100) { clearInterval(fadeId); return 100; }
					return Math.min(100, o + 5);
				});
			}, 20);
		}, delay);
		return () => clearTimeout(id);
	}, [animate, delay]);

	return (
		<box flexDirection="column" alignItems="center" width="100%">
			<box flexDirection="column" alignItems="center" opacity={opacity}>
				<text fg={foreground}>      ██╗      ██████╗ ███████╗</text>
				<text fg={foreground}>     ██║      ██╔══██╗██╔════╝</text>
				<text fg={foreground}>     ██║      ██████╔╝█████╗  </text>
				<text fg={foreground}>     ██║      ██╔══██╗██╔══╝  </text>
				<text fg={foreground}>     ███████╗ ██████╔╝███████╗</text>
				<text fg={foreground}>     ╚══════╝ ╚═════╝ ╚══════╝</text>
			</box>
			<box marginTop={1} opacity={opacity}>
				<text fg={foreground}>Lockstep Boundary Engine</text>
			</box>
		</box>
	);
}
