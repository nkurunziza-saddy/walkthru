"""
What a film's sound is made with, from nothing but numpy: notes, filters, a room, and
the hand's two sounds (a mouse click, a key). Nothing is recorded or licensed: every
sound is computed, so it is the same each time it is made.
"""

import wave

import numpy as np

RATE = 48_000


def hz(note: str) -> float:
    """A note's pitch: "A4" is 440, "Bb1", "F#3"."""
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    n = names[note[0]]
    rest = note[1:]
    if rest.startswith("#"):
        n += 1
        rest = rest[1:]
    elif rest.startswith("b"):
        n -= 1
        rest = rest[1:]
    return 440 * 2 ** ((n + (int(rest) - 4) * 12) / 12)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / RATE)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / RATE)
    X *= 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X, len(x))


class Kit:
    """The instruments, sharing one source of noise so a film sounds the same each time."""

    def __init__(self, seed: int):
        self.rng = np.random.default_rng(seed)

    def noise(self, n: int) -> np.ndarray:
        return self.rng.standard_normal(n)

    def click(self) -> np.ndarray:
        """A mouse button: a short knock and a tick."""
        n = int(0.05 * RATE)
        t = np.arange(n) / RATE
        knock = np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.004)
        tick = highpass(self.noise(n), 3000) * np.exp(-t / 0.002)
        return 0.6 * knock + 0.5 * tick

    def key(self) -> np.ndarray:
        """A key: a soft body and a little top."""
        n = int(0.04 * RATE)
        t = np.arange(n) / RATE
        body = lowpass(self.noise(n), 2500) * np.exp(-t / 0.008)
        top = highpass(self.noise(n), 5000) * np.exp(-t / 0.0025)
        return body * 0.8 + top * 0.35

    def room(self, x: np.ndarray, seconds: float, wet: float) -> np.ndarray:
        """`x` in a room: a decaying tail of filtered noise, mixed back in."""
        n = int(seconds * RATE)
        t = np.arange(n) / RATE
        ir = lowpass(self.noise(n), 5000) * np.exp(-t / (seconds / 5))
        ir[: int(0.012 * RATE)] = 0
        ir /= np.sqrt(np.sum(ir**2))
        size = 1 << int(np.ceil(np.log2(len(x) + n)))
        send = highpass(x, 250)
        y = np.fft.irfft(np.fft.rfft(send, size) * np.fft.rfft(ir, size), size)[: len(x)]
        return x + wet * y


class Layer:
    """One stereo layer of a film's length; sounds are placed in it at a time in seconds."""

    def __init__(self, seconds: float):
        self.length = seconds
        self.n = int(seconds * RATE)
        self.data = np.zeros((2, self.n))

    def put(self, sound: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0):
        i = int(at * RATE)
        if i >= self.n or i + len(sound) <= 0:
            return
        start = max(i, 0)
        end = min(self.n, i + len(sound))
        s = sound[start - i : end - i] * gain
        self.data[0, start:end] += s * np.cos((pan + 1) * np.pi / 4)
        self.data[1, start:end] += s * np.sin((pan + 1) * np.pi / 4)


def write(path: str, data: np.ndarray):
    """A stereo WAV at 48 kHz, 16 bits, clipped and not normalised."""
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(data.T, -1, 1) * 32767).astype("<i2").tobytes())
