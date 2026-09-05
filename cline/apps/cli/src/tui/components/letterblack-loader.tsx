import { useEffect, useRef, useState } from "react";

const LOADER_FRAMES = [
	"[|          ]",
	"[ |         ]",
	"[  |        ]",
	"[   |       ]",
	"[    |      ]",
	"[     |     ]",
	"[      |    ]",
	"[       |   ]",
	"[        |  ]",
	"[         | ]",
	"[          |]",
] as const;

export function LetterblackLoader(props: { color: string }) {
	const [frame, setFrame] = useState(0);
	const directionRef = useRef<1 | -1>(1);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((current) => {
				let next = current + directionRef.current;
				if (next >= LOADER_FRAMES.length - 1) {
					next = LOADER_FRAMES.length - 1;
					directionRef.current = -1;
				} else if (next <= 0) {
					next = 0;
					directionRef.current = 1;
				}
				return next;
			});
		}, 90);
		return () => clearInterval(interval);
	}, []);

	return (
		<box width="100%" justifyContent="center">
			<text fg={props.color}>{LOADER_FRAMES[frame]}</text>
		</box>
	);
}
