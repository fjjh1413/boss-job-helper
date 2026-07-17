# BOSS Job Helper

This repository contains a Chrome Manifest V3 extension for collecting and analyzing job information that is visibly rendered in a signed-in BOSS Zhipin page.

## Scope

- Reads visible job-card and job-detail DOM content from the current browser page.
- Keeps collection state, pause/resume/stop controls, retries, deduplication, and progress in the extension.
- Stores collected records locally in the browser IndexedDB.
- Provides structured job analysis, candidate matching, JD summaries, and CSV/JSON export.
- Does not bypass login, CAPTCHA, anti-bot controls, platform restrictions, or hidden data access.

## Install Locally

1. Open `chrome://extensions/` in Chrome.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open a BOSS Zhipin search-results page and use the extension toolbar button.

## Development

```text
npm test
node --check analyzer.js
node --check background.js
node --check content.js
node --check popup.js
```

## Main Modules

- `background.js`: persistent agent state, runner-tab lifecycle, pause/resume/stop handling, and message routing.
- `runner.js` / `runner.html`: collection orchestration, detail processing, retries, pagination, progress, and the runner console.
- `content.js`: visible DOM collection for search results and job details.
- `agent-state.js`: pure state transitions, queue progress, deduplication, and failure records.
- `analyzer.js`: field normalization, JD analysis, keyword extraction, candidate matching, and resume advice.
- `storage.js`: local IndexedDB persistence and URL-based upsert behavior.
- `popup.js`: user controls, local data preview, and export actions.
- `tests/`: regression tests for analysis, state transitions, link handling, and export safety.

## Data and Privacy

Collected job records remain in the browser's local extension storage. Do not share exported data, browser profiles, HAR files, cookies, or authentication tokens publicly.
