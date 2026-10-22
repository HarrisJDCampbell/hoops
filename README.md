# hoops

Your GitHub contribution graph, played as a basketball shootaround.

A little pixel player walks along under your contribution grid. For every day you contributed, he reaches up, the day's square floats down into his hands and becomes the ball, and he dribbles, steps in and shoots. Every shot goes in, worth that day's contribution count. When the year is done he jogs to the hoop and dunks.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HarrisJDCampbell/hoops/output/hoops-dark.svg" />
  <img width="100%" alt="A pixel basketball player shooting a year of GitHub contributions, one made shot per day" src="https://raw.githubusercontent.com/HarrisJDCampbell/hoops/output/hoops.svg" />
</picture>

<sub>That's the maintainer's real last year, regenerated every night by this repo's own workflow.</sub>

## Put it on your profile

Your profile README lives in a repo named after your username (`you/you`). Add this workflow to it as `.github/workflows/hoops.yml`:

```yaml
name: hoops

on:
  schedule:
    - cron: "0 0 * * *" # every night
  workflow_dispatch:

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: HarrisJDCampbell/hoops@v1
        with:
          github_user_name: ${{ github.repository_owner }}
          out_dir: dist

      - uses: crazy-max/ghaction-github-pages@v3
        with:
          target_branch: output
          build_dir: dist
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Run it once from the Actions tab, then add this to your README, replacing `you` with your username:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/you/you/output/hoops-dark.svg" />
  <img width="100%" alt="my contributions, played as a basketball shootaround" src="https://raw.githubusercontent.com/you/you/output/hoops.svg" />
</picture>
```

## Options

| Input | Default | What it does |
|---|---|---|
| `github_user_name` | repo owner | Whose calendar to play. |
| `github_token` | `github.token` | Reads the public contribution calendar. The default workflow token is enough. |
| `out_dir` | `dist` | Where `hoops.svg` (light) and `hoops-dark.svg` (dark) are written. |
| `jersey` | `blue-gold` | `blue-gold`, `purple-gold`, `green-white`, `red-white`, `orange-navy`, `black-teal`, or your own `"primary,trim"` hex pair, e.g. `"#1d428a,#ffc72c"`. |
| `skin` | `#c68b59` | The player's skin tone, as a hex colour. |
| `hair` | `#2b1d14` | The player's hair colour, as a hex colour. |
| `hair_style` | `short` | The player's hairstyle: `short`, `long`, or `headband`. |
| `pace` | `1` | How relaxed he plays, from `0.25` (quick) to `4` (very slow). At `1` a shot takes about 3 seconds, so an active year runs several minutes. |

Outputs: `light` and `dark`, the paths of the two files.

## Run it locally

No dependencies, just Node 20 or newer.

```sh
git clone https://github.com/HarrisJDCampbell/hoops && cd hoops
GITHUB_TOKEN=$(gh auth token) node bin/hoops.mjs --user octocat --jersey purple-gold --out dist
open dist/hoops-dark.svg
```

`--fixture test/fixtures/calendar.json` renders a made-up year without touching the network.

## How it works

- **One clock for everything.** `buildTimeline()` lays out the whole game as timed events: walk, grab, dribble, release, swish, score. `render()` then compiles those events into one CSS `@keyframes` rule per element on a single shared loop length, so the ball, the player, the net, the falling squares and the scoreboard can't drift out of sync.
- **Real shot arcs.** Each shot is a quadratic Bézier with its control point halfway across, so the ball moves sideways at a constant speed while its height follows a parabola, like a real shot under gravity. The curve is sampled into short straight segments because animating along a path directly is unreliable in Safari.
- **Plain SVG and CSS.** No JavaScript runs in the image, so it animates anywhere GitHub shows an `<img>`.
- **What counts.** The numbers come from the same calendar your profile shows: commits, pull requests, issues and reviews. If you've turned on "include private contributions", private work counts too, as anonymous numbers.

## Contributing

Ideas and pull requests are welcome. Check the [open issues](https://github.com/HarrisJDCampbell/hoops/issues), especially the ones labelled `good first issue`. Run `npm test` before opening a PR.

## Credits

Inspired by [Platane/snk](https://github.com/Platane/snk), the contribution snake. MIT licensed.
