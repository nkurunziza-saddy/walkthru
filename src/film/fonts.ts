import "@fontsource-variable/geist";
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

/** Holds the render until every face the film uses has loaded. */
export function useFonts() {
	const [handle] = useState(() => delayRender("Loading fonts"));
	useEffect(() => {
		Promise.all(
			["400 40px 'Geist Variable'", "500 40px 'Geist Variable'"].map((face) =>
				document.fonts.load(face),
			),
		).then(
			() => continueRender(handle),
			() => continueRender(handle),
		);
	}, [handle]);
}
