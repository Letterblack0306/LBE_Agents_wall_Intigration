import { useTheme } from "../hooks/use-theme";

export function LetterblackLogo() {
	const theme = useTheme();
	const foreground = theme.defaultForeground;
	const accent = theme.accents.success;

	return (
		<box flexDirection="row" alignItems="center" justifyContent="center" width="100%">
			<text fg={foreground}>
				<strong><span fg={accent}>LBE</span></strong>
				<span fg="gray"> · Lockstep Boundry Engine · </span>
				<strong>LETTERBLACK</strong>
			</text>
		</box>
	);
}
