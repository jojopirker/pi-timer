# Pi Run Timer

This repo is structured as a Pi package that adds a per-run elapsed timer inline in Pi's footer.

Demo video: [example.mp4](https://raw.githubusercontent.com/jojopirker/pi-timer/main/example.mp4)

## Layout

- `extensions/run-timer.ts` - package entrypoint for npm or `pi install`
- `.pi/extensions/run-timer.ts` - local project entrypoint that re-exports the package extension for auto-discovery during development

## Behavior

- Starts timing on `agent_start`
- Updates once per second
- Stays visible after `agent_end`
- Resets on the next run
- Renders inline on the stats row, after the context segment, instead of on a separate status line

## Local testing

From this repo:

```bash
pi
```

Pi auto-discovers `.pi/extensions/run-timer.ts` in this project.

You can also force-load the package or file directly:

```bash
pi -e .
pi -e ./extensions/run-timer.ts
```

If Pi is already running, use `/reload` after edits.

## Install as a package

From a local path:

```bash
pi install /absolute/path/to/pi-timer
```

Once published to npm:

```bash
pi install npm:pi-timer
```

## Publish on npm

The package manifest is in `package.json` and uses Pi's package conventions:

- `keywords: ["pi-package"]` makes it discoverable as a Pi package
- `pi.extensions` points Pi at `extensions/*.ts`
- `pi.video` points at the demo MP4 hosted in this GitHub repo
- the package ships raw TypeScript, which Pi loads through `jiti`

Before publishing:

1. Keep the `name` in `package.json` as `pi-timer`, unless you decide to publish under a different npm package name.
2. Push `example.mp4` and the metadata changes to `main`, so the video URL is live.
3. Run `npm publish`.

## Notes

Pi's extension API does not expose the built-in footer as a composable primitive. To place the timer beside the context segment, this package uses `ctx.ui.setFooter()` and recreates Pi's default footer layout with the timer appended inline.
