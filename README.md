# walkthru

Walkthrough films of an app, made by scripting the real app.

You write a script of what a person does (tap, type, choose). walkthru runs it
against your app on a fake clock and seeded data, moves a real mouse so hovers and
menus show, records the screen, then draws a film around it: a window, captions in
each language, a cursor, the day, and sound. A film is only as true as the app:
when a screen changes, the script fails until it is fixed.

It started inside [Rugero](https://rugero.app) as its guide films and is being made
into a tool of its own. **Status: planning.** Nothing here runs yet; see
[docs/PLAN.md](docs/PLAN.md) for the design and the order of work.

## Why it is quick to change

A film is drawn in parts (a title, each scene, the end), each kept under a fingerprint
of its recording, words, look and code. Fix a caption and only the scenes it touches
are drawn again, in seconds. A scene is filmed again from where it starts, not the
whole story. Parts can be drawn on free build machines at once.

## Licence

MIT. Drawing uses [Remotion](https://www.remotion.dev), which has its own licence:
free for teams of up to three people; read it before you use this for more.
