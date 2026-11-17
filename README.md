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
drawing (it draws Rugero's films pixel for pixel, given Rugero's brand as data), and
the recorder, for topics and for stories told in scenes (an app is plugged in through a
`Host`), the command line and the Studio.

## Use

An app has a `walkthru.config.ts` (its host, brand, look, stories and languages). From
that folder:

```sh
walkthru plan boutique-month --lang rw    # what is out of date, and about how long
walkthru make boutique-month --lang rw    # film what changed, draw what changed, lay the sound
walkthru studio                           # the same, on a page, and the look
walkthru draw boutique-month --lang rw --remote   # draw on build machines (GitHub Actions)
walkthru doctor                           # what this machine has and lacks
```

`--remote` cuts the parts to draw into chunks of at most 10 s, draws them at once on
GitHub's build machines at this checkout's pushed commit, and brings them home: this
machine stays free. On a public repository it costs nothing; a private one spends its
monthly free minutes (about 5 minutes a chunk). `node tools/check-remote.ts` draws a
sample film both ways and compares them.

A scene is filmed again when its script changes (its steps' code, its moment, who is in
it), not when its caption does: a caption is drawn. A film is drawn in parts and only
the parts a change touches are drawn again. See [docs/PLAN.md](docs/PLAN.md).

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
| `src/record/types.ts` | scripts (topics, stories, steps) and the `Host` an app provides |
| `src/record/run.ts` | records one topic: steps, the real mouse, frames, times of taps and keys |
| `src/record/story.ts` | records a story scene by scene, or from one scene on |
| `src/make/` | the plan (what is stale, how long), drawing a film in parts, its sound |
| `src/cli.ts` | the command line |
| `src/studio/` | the Studio: the films page and the look page |

## Why it is quick to change

A film is drawn in parts (a title, each scene, the end), each kept under a fingerprint
of its recording, words, look and code. Fix a caption and only the scenes it touches
are drawn again, in seconds. A scene is filmed again from where it starts, not the
whole story. Parts can be drawn on free build machines at once.

## Licence

MIT. Drawing uses [Remotion](https://www.remotion.dev), which has its own licence:
free for teams of up to three people; read it before you use this for more.
