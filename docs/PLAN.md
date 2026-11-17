# The plan

walkthru makes walkthrough films of an app by scripting the real app. This is the
design and the order of work. It comes from building the guide films of
[Rugero](https://rugero.app) (about 20,000 lines in its `apps/video`), where these
were learned the slow way: a full redo of eight films took about 24 hours.

## The pipeline

```
script -> record -> plan -> draw -> mix -> publish
```

| Stage | In | Out | Kept under |
| --- | --- | --- | --- |
| **Script** | what a person does, in the app's own words, with captions per language | a film: scenes, steps | the script file |
| **Record** | the script, the app, a fake clock, seeded data | per scene: a video, the taps and keys with their times, a picture of each step | the scene's recording folder |
| **Plan** | the recordings, the look, the film's code | the film cut into parts, each with a fingerprint | nothing: it is cheap |
| **Draw** | the missing parts | one video per part | the fingerprint (a part is drawn once) |
| **Mix** | the joined picture, the taps and keys | the film with its sound | the joined picture |
| **Publish** | the finished films | site copies, posters, chapters, a manifest | files |

`walkthru make <film>` runs what is stale and nothing else, and **prints the plan
first**: which scenes will be filmed again, which parts drawn, about how long. It
refuses to start a heavy job when something else is using the CPU.

## What the host app provides: the adapter

walkthru knows nothing about any app. The host gives it one `walkthru.config.ts`:

```ts
export default defineConfig({
  app: {
    start(opts: { at: Date; fresh: boolean }): Promise<{ url: string; stop(): Promise<void> }>,
    seed(world: World): Promise<void>,       // the same shop, prices and numbers each run
    signInLink(email: string): Promise<string>,   // the link the app "emails"
    words(lang: string): Promise<Record<string, string>>, // the app's own catalog, so scripts are written once in English
  },
  languages: ["en", "rw", "fr"],
  shapes: ["desktop", "phone"],
  films: "./films",
});
```

`start` is where the fake clock lives (Rugero sets the server's clock with
libfaketime and the browser's with Playwright's clock). Everything Rugero-specific
(its database, its sample shop, its API) stays in Rugero's own adapter.

## What exists today in Rugero and where it goes

| Today (`apps/video`) | Lines | Becomes |
| --- | --- | --- |
| `guide/record/*` the recorder, real mouse, frame capture | ~1,350 | `src/record` |
| `guide/ways.ts` visible navigation helpers | ~500 | stays in the host (it knows Rugero's menus); the idea is documented |
| `guide/topics`, `guide/story` scripts | ~8,000 | stay in the host as the films' scripts |
| `src/guide/*` the film (window, captions, cursor, cards, text effects) | ~1,900 | `src/compose` |
| `tools/guide.mjs`, `segments.mjs`, `presses.mjs` the pipeline | ~2,200 | `src/plan`, `src/draw`, the command line |
| `sound/*` made in code (piano, clicks, keys) | ~1,350 | `src/mix` |
| `tools/look-lab.*` | ~400 | the Studio's Look page |
| promo films, tours, shorts (`src/app`, `src/films`) | ~18,000 | stay in Rugero: not this product |

## Speed

Measured on the 12-thread machine it was built on:

- A final draws at **7–10 frames a second**; a first draw of a 5–7 minute film is
  20–40 minutes. Nothing helped: recordings stored with a full picture every frame
  (slower), GPU drawing (same), encoder preset, JPEG quality, more tabs or threads.
  **Three drawings at once total no more than one**: it is CPU-bound.
- A story is filmed for 7–10 minutes but takes 10–35 minutes: the server restarts between
  scenes and days are built through the API. Only about 25–30% of filmed time is the
  screen sitting still while a caption is read.

Done: drawing in kept parts (a caption fix redraws 2 parts of 22 in about 20 s, seams
invisible at 47 dB), filming again from a scene (`--from`/`--to`, earlier scenes replay
at dry-run speed), sound in the same command, bundles removed on exit.

Next, in this order:

1. **Draw on free build machines.** Each part is independent and fingerprinted, which
   is what a cloud renderer's chunk is. One GitHub Actions job per part, recordings and
   parts in a content-addressed store. A public repo's standard runners are free; a
   private repo's free credit is about 2,000 two-core minutes a month (GitHub's page).
   *Guess, not measured:* with ~20 jobs at once a film draws in a few minutes and the
   author's machine stays free. Remotion Lambda was read and rejected (needs a paid
   AWS account; about $0.10 for a 10-minute film).
2. **Film several scenes or stories at once.** Filming waits more than it computes.
   Each recording needs its own port, database, state folder and log. Untried.
3. **Skip the caption-reading waits** (a hold becomes a recorded duration, with the
   clock moved on, not slept through): about 25–30% off filming.
4. **A load guard**: heavy work waits for a quiet machine.

## The Studio

A local app (`walkthru studio`), designed under the product-ui rules (13px base on a
1.125 scale, sentence case, compact 28px controls, one accent, no toasts, no glows).

- **Job:** bring the films up to date. One primary action, **Update films**.
- **Content:** a list of films with a plain state ("Up to date", "2 scenes changed");
  a film opens to its scenes (Filmed, Changed, New). The plan sits above in one line.
  No cards, icons, dividers or counts.
- **States:** running is the row's own text ("Filming scene 4 of 16"); failed is an
  inline line under the row; empty, long names and disabled (while another job runs)
  are designed first.
- **Look:** the old look lab: pick the background and tune the look by eye, then save
  it. The same fields, in the same style.
- The state text is the feedback. Nothing pops up.

## Order of work

0. **Scaffold**: licence, readme, this plan. Done.
1. **Extract the parts that know no app**. Done: the timeline (`src/timeline.ts`), the
   planner and fingerprints (`src/plan.ts`) and the sound (`sound/`, identical to
   Rugero's to the sample), with tests and CI. The film's drawing too
   (`src/film`): Rugero's colours, mark, words and grounds are a `brand` and file
   names the host gives, and given Rugero's brand it draws Rugero's frames pixel for
   pixel (the only differences are the mark's edge smoothing, which differs between
   two renders of Rugero itself). Was: the planner and fingerprints, the timeline,
   the presses, the sound, the compose layer and text effects, with tests (the
   planner's seam check, the timeline against the film's length).
2. **The adapter and the recorder.** Done in walkthru: `src/record` (topics and stories,
   `--from`/`--to`), with the app behind a `Host`. Checked with a throwaway Rugero host:
   first-sale runs six ways and films the same steps, taps and keys as Rugero's own
   recorder (lengths within 0.1 s); boutique-month's 16 scenes run, and its Sunday was
   filmed alone in 90 s with the scenes before it replayed. Rugero's real adapter
   comes with step 6.
3. **The command line**: `plan`, `make`, `record`, `draw`, `studio`, `doctor`. Done:
   a scene's script fingerprint (not its captions) decides what is filmed again, from
   the first changed scene on (`--only` for just the changed); the parts decide what
   is drawn; a busy machine is refused (`--anyway`). Not yet: `init`, `publish`.
4. **The Studio**. Done: the films page (each story and language with its plan line,
   Update, its scenes with Film again; Draft or Final; one job at a time, the row's
   text says what is happening) and the look page (the look lab, its paths from the
   config).
5. **Drawing on build machines.**
6. **Rugero consumes it:** `apps/video`'s guide becomes a config and its scripts.
7. **Make the repo public** after a check that nothing private is in it (no Rugero
   data, no recordings of real people, no secrets, no personal pictures).

## Licence and what is not in the repo

MIT. Drawing uses Remotion, which has its own licence (free for teams of up to three;
it does not cover letting others submit their own Remotion code to a server you run).
Fonts are open; the music and sounds are made in code. The grounds are pictures of the
author's own: they stay out.

## Open

- The npm name `walkthru` is taken by an unrelated tool: a scoped name if this is ever
  published there.
- Whether the compose layer stays Remotion or moves to an Apache-2.0 renderer
  (HyperFrames draws through headless Chrome and ffmpeg too, so it would not be faster).
