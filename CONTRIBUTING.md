# Contributing to hoops

Thanks for helping. hoops is small on purpose, so most changes touch one or two files.

## Setup

No dependencies. You need Node 20 or newer.

```sh
git clone https://github.com/<you>/hoops && cd hoops
npm test        # the test suite, no network needed
npm run demo    # renders a made-up year into dist/
open dist/hoops-dark.svg
```

To render a real account: `GITHUB_TOKEN=$(gh auth token) node bin/hoops.mjs --user <name> --out dist`.

## Where things live

- `src/render.mjs`: everything you see. `buildTimeline()` lays out the game as timed events, `render()` turns them into SVG and CSS keyframes. Jersey presets are in `JERSEYS` at the top.
- `src/github.mjs`: fetches the contribution calendar.
- `src/index.mjs` and `action.yml`: the GitHub Action wrapper. A new input needs adding to both.
- `bin/hoops.mjs`: the local CLI.
- `test/`: tests run on a seeded fake calendar in `test/fixtures/`.

## Checking an animation by eye

The loop runs for minutes, so don't wait for the moment you changed. Freeze it at any time `t` by adding this inside the SVG's `<style>`, then open the file in a browser:

```css
*{animation-play-state:paused!important;animation-delay:-42s!important}
```

`node bin/hoops.mjs --fixture test/fixtures/calendar.json --debug 10` prints when shot 10 happens, so you know which `t` to freeze at.

## Pull requests

- Keep the action dependency-free. People run it in their own workflows, and every dependency is something they have to trust.
- Anything from an input that ends up in the SVG must be validated (like the hex colour checks) or escaped (like the user name). Add a test for it.
- Jersey presets use colour names, not team names.
- Run `npm test` before opening the PR. CI runs it on Node 20, 22 and 24.
- If it changes what the animation looks like, add a screenshot of a frozen frame to the PR.

If you're unsure whether an idea fits, open an issue or a discussion first. Small, focused PRs get merged fastest.
