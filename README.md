# walkthru

Walkthrough films of an app, made by scripting the real app.

You write a script of what a person does (tap, type, choose). walkthru runs it
against your app on a fake clock and seeded data, moves a real mouse so hovers and
menus show, records the screen, then draws a film around it: a window, captions in
each language, a cursor, the day, and sound. A film is only as true as the app:
when a screen changes, the script fails until it is fixed.

It started inside [Rugero](https://rugero.app) as its guide films and is being made
into a tool of its own. **Status: early.** The parts that know no app are here and
tested: the timeline, the planner that keeps drawn parts, the sound, and the film's
drawing (it draws Rugero's films pixel for pixel, given Rugero's brand as data). The
recorder and the command line come next. See [docs/PLAN.md](docs/PLAN.md).

## Working on it

Node 22.18 or later, Python 3 with numpy (`pip install -r sound/requirements.txt`),
and [Vite+](https://viteplus.dev):

```sh
vp install
vp check          # format, lint
vp test           # the tests
npx tsc --noEmit  # types
```

| Where | What |
| --- | --- |
| `src/timeline.ts` | a film's timeline: where each part starts, where each press falls |
| `src/plan.ts` | the film cut into parts, each kept under a fingerprint |
| `sound/` | the piano and the hand (clicks, keys), made in code |
| `src/film/` | the films' drawing (Remotion): the window, captions, cursor, cards, text effects |
| `src/film/brand.tsx` | whose film it is: name, mark, colours, the film's own words |
| `src/render/bundle.ts` | the films bundled for drawing |

## Why it is quick to change

A film is drawn in parts (a title, each scene, the end), each kept under a fingerprint
of its recording, words, look and code. Fix a caption and only the scenes it touches
are drawn again, in seconds. A scene is filmed again from where it starts, not the
whole story. Parts can be drawn on free build machines at once.

## Licence

MIT. Drawing uses [Remotion](https://www.remotion.dev), which has its own licence:
free for teams of up to three people; read it before you use this for more.
