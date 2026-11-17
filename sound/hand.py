"""
The hand under a film: a soft click at each press of the cursor and a lighter tick at
each key, at a fixed quiet level. It is not normalised: a click is heard because it
is there, not because it is loud.

    python3 sound/hand.py <seconds> <presses.json> <out.wav>

`presses.json` is {"clicks": [...], "keys": [...]}, in seconds from the film's start.
"""

import json
import sys

import numpy as np

from kit import Kit, Layer, write

# A click's peak, about -24 dBFS: under the screen, over a piano at -30 LUFS.
LEVEL = 0.06


def hand(seconds: float, clicks: list[float], keys: list[float], seed: int = 7104) -> np.ndarray:
    kit = Kit(seed)
    layer = Layer(seconds)

    def put(sound: np.ndarray, at: float, level: float, pan: float):
        sound = sound / np.max(np.abs(sound)) * level * kit.rng.uniform(0.85, 1.0)
        layer.put(sound, at, 1.0, pan)

    # The mouse slightly to the right, where a hand on it is; the keys nearer the middle and softer.
    for at in clicks:
        put(kit.click(), at, LEVEL, 0.15)
    for at in keys:
        put(kit.key(), at + float(kit.rng.uniform(-0.006, 0.006)), LEVEL * 0.55, 0.05)
    return layer.data


if __name__ == "__main__":
    seconds, presses, path = float(sys.argv[1]), sys.argv[2], sys.argv[3]
    times = json.load(open(presses))
    write(path, hand(seconds, times["clicks"], times["keys"]))
    print("wrote", path, f"{len(times['clicks'])} clicks, {len(times['keys'])} keys")
