# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

This is **workshop-tools**, a static HTML/CSS/JS UI mock-up of an AI Workshop Sandbox (workbench for wiring AI pipeline components). There is no backend, no build step, and no package manager dependencies.

The actual application code lives in `workshop-sandbox/` (on the feature branch `cursor/ai-workshop-sandbox-mockup-c4a1`).

### Running the Application

Serve the `workshop-sandbox/` directory with any static HTTP server:

```sh
python3 -m http.server 8080 --directory workshop-sandbox
```

Then open `http://localhost:8080` in a browser.

### Testing

- **No automated test framework** is configured. The app is a pure UI mock-up.
- Manual testing: open in browser, click palette buttons to add blocks to the sheet, use preset buttons, click "Run" (stub), and click "Clear sheet".
- No lint tooling is configured (no ESLint, no Prettier).

### Key Caveats

- The `main` branch contains only `README.md`. All product code is on the feature branch.
- The "Run" button is a stub — it shows a toast but does not execute anything.
- Google Fonts (DM Sans) is loaded via CDN; offline environments will fall back to system-ui.
