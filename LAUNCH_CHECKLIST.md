# Launch checklist

## Before connecting a domain

- Deploy this repository to Vercel. The project is a static Vite build and needs no server or environment variable to run.
- Use the assigned `*.vercel.app` address only for private testing. Do not submit it to search engines.
- Choose and purchase one permanent domain. The site currently uses `mahjongroguelike.com` in canonical URLs, sitemap entries, social metadata, and contact addresses; replace this value everywhere only after the domain is active.

## Before public launch

- Add the final domain in Vercel and enforce the `www` or non-`www` version consistently.
- Replace all `mahjongroguelike.com` references, then run `npm.cmd run build`.
- Create a Google Search Console property for the final domain, submit `/sitemap.xml`, and request indexing for the home page, `/play`, the rules page, and the yaku page.
- Add a real analytics provider before sending traffic. The game already emits `run_start`, `win`, and `run_complete` when Umami is installed; `run_start` distinguishes daily and review sessions.

## Four-week validation

Track weekly: visitors, game starts, first-run completion, average questions answered, and return visits. Keep building only if first-run completion reaches 40% or more and the game receives repeat usage; otherwise focus on the quiz/trainer entry points rather than publishing more generic Mahjong articles.
