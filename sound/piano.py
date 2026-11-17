"""
The music under a film: a soft felted piano in F, a few notes of each chord, slowly
and never on a grid, with no beat and nothing that starts or stops sharply. It is
there, not listened to. Lay it under the film quietly (the tool normalises it to
-30 LUFS).

    python3 sound/piano.py <seconds> <out.wav>
"""

import sys

import numpy as np

from kit import RATE, Kit, Layer, highpass, hz, lowpass, write

# Four chords in F, each with its root and the notes a hand would pick from it.
CHORDS = [
    ("F1", ["F3", "C4", "G4", "A4"]),
    ("C2", ["E3", "C4", "D4", "G4"]),
    ("D1", ["D3", "A3", "E4", "F4"]),
    ("Bb0", ["Bb2", "F3", "C4", "D4"]),
]


def felt(f: float, dur: float = 4.0) -> np.ndarray:
    """A piano note through felt: a soft attack, few overtones, a long fall."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    s = sum(a * np.sin(2 * np.pi * f * h * t) * np.exp(-t / (1.6 / h)) for h, a in ((1, 1), (2, 0.35), (3, 0.12), (4, 0.05)))
    s *= np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.3)
    return lowpass(s, 2400)


def piano(seconds: float, seed: int = 5203) -> np.ndarray:
    kit = Kit(seed)
    rng = kit.rng
    layer = Layer(seconds)
    chord = 8 * 60 / 52
    s, i = 0.0, 0
    while s < seconds:
        root, notes = CHORDS[i % 4]
        layer.put(felt(hz(root[:-1] + str(int(root[-1]) + 1)), 6.0), s, 0.16)
        # Three or four notes of the chord, unhurried.
        at = s + 0.6
        for note in rng.choice(notes, size=int(rng.integers(3, 5)), replace=False):
            layer.put(felt(hz(str(note))), at, 0.11, pan=float(rng.uniform(-0.3, 0.3)))
            at += float(rng.uniform(1.2, 2.2))
        s += chord
        i += 1
    t = np.arange(layer.n) / RATE
    music = np.stack([highpass(kit.room(ch, 2.6, 0.35), 35) for ch in layer.data])
    # Three seconds in, two and a half out.
    fade = np.minimum(1, t / 3.0) * np.clip((seconds - t) / 2.5, 0, 1)
    mix = music * fade
    peak = np.max(np.abs(mix)) or 1.0
    mix = np.tanh(mix / peak * 1.3) / np.tanh(1.3)
    return mix * 10 ** (-1 / 20) / (np.max(np.abs(mix)) or 1.0)


if __name__ == "__main__":
    seconds, path = float(sys.argv[1]), sys.argv[2]
    write(path, piano(seconds))
    print("wrote", path, f"{seconds:.1f}s")
