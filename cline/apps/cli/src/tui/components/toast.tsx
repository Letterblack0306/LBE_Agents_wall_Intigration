import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTheme } from "../hooks/use-theme";

export type ToastVariant = "info" | "success" | "error";

export type ToastState = {
	message: string;
	variant: ToastVariant;
	autoDismiss?: number;
};

export function Toast(props: { toast: ToastState | null }) {
	const { width } = useTerminalDimensions();
	const theme = useTheme();
	const [slideIn, setSlideIn] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	if (!props.toast || dismissed) return null;

	const variantColor: Record<ToastVariant, string> = {
		info: theme.accents.act,
		success: theme.accents.success,
		error: theme.accents.error,
	};
	const availableWidth = Math.max(1, width - 4);
	const maxWidth = Math.min(44, availableWidth);
	const right = width < 32 ? 0 : 2;
	const color = variantColor[props.toast.variant];

	useEffect(() => {
		setSlideIn(false);
		const id = setTimeout(() => setSlideIn(true), 10);
		return () => clearTimeout(id);
	}, [props.toast?.message]);

	useEffect(() => {
		if (!props.toast?.autoDismiss) return;
		const id = setTimeout(() => {
			setSlideIn(false);
			setTimeout(() => setDismissed(true), 200);
		}, props.toast.autoDismiss);
		return () => clearInterval(id);
	}, [props.toast?.autoDismiss, props.toast?.message]);

	return (
		<box
			position="absolute"
			zIndex={100}
			top={1}
			right={right}
			maxWidth={maxWidth}
			border
			borderStyle="rounded"
			borderColor={color}
			paddingX={1}
			opacity={slideIn ? 100 : 0}
		>
			<text fg={color} wrapMode="word">{props.toast.message}</text>
		</box>
	);
}

export function ToastStack(props: { toasts: ToastState[] }) {
	return (
		<box position="absolute" zIndex={100} top={1} right={2} flexDirection="column" gap={1}>
			{props.toasts.map((toast, i) => <Toast key={`${toast.message}-${i}`} toast={toast} />)}
		</box>
	);
}
