# Contributing

Thanks for your interest in improving Footing.

## Getting started
1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install dependencies: `npm install`
3. Copy the env template and fill in your own Firebase web config: `cp .env.example .env.local`
4. Start the dev server: `npm run dev` (port 3101)

## Before you open a PR
- `npm run ci` passes (audit, lint, typecheck, unit tests with coverage).
- `npm run e2e` passes (Playwright; it targets the live URL by default, `npm run e2e:local` targets your dev server).
- Add or update tests for any behavior change. Name a regression test after the defect it pins.
- Keep commits conventional (`feat:`, `fix:`, `perf:`, `docs:`, `test:`, `ci:`, `chore:`); the release workflow reads them.
- Never commit keys, tokens or `.env.local`. Footing's rule: a verdict is only shown when its quote is found verbatim in the fetched source.

## Reporting bugs / requesting features
Open an issue with the provided templates. Include repro steps, expected vs. actual behavior, and your browser and OS.
