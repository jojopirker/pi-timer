# Pi Timer

Pi extension that adds a per-run timer to the footer.

![Pi Timer demo](./example.gif)

## Install

```bash
pi install npm:pi-timer
```

From GitHub:

```bash
pi install git:github.com/jojopirker/pi-timer
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-timer
```

Demo video: [example.mp4](https://raw.githubusercontent.com/jojopirker/pi-timer/main/example.mp4)

## What It Does

- Shows a live timer while the agent is running
- Keeps the final duration visible after the run ends
- Resets on the next run
- Renders inline in the footer instead of on a separate status line
- Uses `runs for` while active and `ran for` after completion

## Local Development

Pi auto-discovers `.pi/extensions/run-timer.ts` in this repo.

```bash
pi
```

You can also load the package directly:

```bash
pi -e .
```

If Pi is already running, use `/reload` after edits.

## Publish

1. Push `example.mp4` and the current metadata to `main`, so the video URL is live.
2. Run `npm login`.
3. Run `npm publish --access public`.

## Notes

Pi's extension API does not currently expose the built-in footer as a composable primitive. This package uses `ctx.ui.setFooter()` and recreates the default footer layout so the timer can appear inline.
