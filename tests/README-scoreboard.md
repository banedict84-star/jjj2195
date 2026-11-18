# Scoreboard regression checks

Install development-only test dependencies outside the production site:

```sh
npm install --prefix /tmp/scoreboard-tests jsdom playwright
NODE_PATH=/tmp/scoreboard-tests/node_modules node tests/scoreboard-dom.cjs
```

The DOM suite uses only temporary, in-memory storage. It checks pitcher selection,
runner-out counts, inning transitions, substitutions, duplicates, undo, backup
compatibility, malformed backups, quota rollback, and display rendering.

For browser coverage, serve the repository root with `python -m http.server 8765`,
then run `tests/scoreboard-regression.cjs` with Playwright and Chromium installed.
The browser suite uses a fresh context. It never opens an existing user profile.
`TEST_URL` can point it at a deployed test site.
