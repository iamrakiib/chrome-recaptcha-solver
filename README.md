# reCAPTCHA Solver for Chrome

A Chrome Manifest V3 extension that detects reCAPTCHA v2 challenges on Google pages, requests solution tokens through the 2Captcha API, and delivers the tokens to the page.

The project demonstrates browser extension architecture, asynchronous API integration, dynamic DOM observation, and communication between a webpage and an extension. CAPTCHA solving is performed by 2Captcha, not by a local model.

## Features

- Detects reCAPTCHA widgets through DOM scanning and page-context hooks.
- Captures widget callbacks for JavaScript-rendered challenges.
- Submits tasks to 2Captcha and polls for their results.
- Inserts solution tokens and attempts form submission.
- Displays live progress and errors in a toolbar popup.
- Restricts execution to Google domains through manifest permissions and runtime checks.
- Includes session tracking and duplicate-request guards.

## Requirements

- A Chromium-based browser with Manifest V3 support.
- A 2Captcha account, API key, and sufficient balance.

## Installation

1. Download or clone this repository.
2. Copy **config.example.js** to **config.js** in the project root.
3. Replace **YOUR_2CAPTCHA_API_KEY** in the local **config.js** with your API key.
4. Open **chrome://extensions** and enable **Developer mode**.
5. Select **Load unpacked** and choose the project folder.
6. Open the extension popup on a matching Google page to view its status.

**config.js** is intentionally excluded from version control. Keep your local copy private. The published example contains a placeholder only.

## How it works

1. **inject.js** runs in the page context and detects widget configuration and callbacks.
2. **content.js** receives widget events or finds static markup, then requests a solution through Chrome runtime messaging.
3. **background.js** submits the task to 2Captcha and polls for a token.
4. **content.js** delivers the token to the page; **inject.js** invokes a captured callback where available. The content script also attempts to submit the CAPTCHA form.
5. **popup.js** reads stored status and displays subsequent updates.

## Project structure

| File | Responsibility |
| --- | --- |
| manifest.json | Manifest V3 declaration, Google host permissions, script registration, and popup entry point |
| background.js | 2Captcha requests, polling, and message handling |
| content.js | DOM detection, session tracking, token delivery, and form submission |
| inject.js | Page-context hooks and widget callback handling |
| config.example.js | Public configuration template with a placeholder API key |
| config.js | Private local configuration; created during setup and ignored by Git |
| popup.html | Extension popup layout |
| popup.js | Active-domain checks and live status display |
| DEVELOPMENT.md | Development and maintenance guidance |

## Configuration

The current configuration targets **google.com** and its subdomains. Changing the target requires updating **ALLOWED_DOMAIN** and all relevant match patterns in **manifest.json**. The page detection and submission routines are tailored to Google challenge pages.

| Setting | Current behavior |
| --- | --- |
| ALLOWED_DOMAIN | Domain used by runtime host checks |
| TWOCAPTCHA_API_KEY | Local credential for the 2Captcha API |
| POLL_INTERVAL_MS | Delay between polling requests; default 8 seconds |
| MAX_POLL_ATTEMPTS | Polling limit; default 60 attempts, approximately 8 minutes plus network time |

The template also contains v3 tuning and automatic-submission options retained from earlier development. The current solve path supports **reCAPTCHA v2 only** and does not consult those options.

## Limitations

- The background worker currently implements reCAPTCHA v2 only. Hooks for other CAPTCHA libraries do not constitute end-to-end support.
- Some detection paths read internal reCAPTCHA objects and can break when the page or library changes.
- Status is shared between tabs in the popup.
- Automatic reloads and session tracking do not guarantee a bounded number of retries across page reloads.
- Long-running polling depends on the browser service worker lifecycle.
- API completion does not guarantee that the target page accepts a token or navigates successfully.
- No automated test suite or build pipeline is included. The source files are loaded directly by the browser.

## Privacy and credentials

- No personal API key is included in the repository.
- The local configuration file, environment files, logs, and generated ZIP archives are excluded from Git.
- API requests send the page URL, site key, and available challenge metadata to 2Captcha.
- Background diagnostic logs omit the API key, solution tokens, and challenge metadata values.
- The extension uses a paid external service. Use it only where you have authorization to automate the workflow.

## Development

Edit the source files, reload the extension from **chrome://extensions**, and refresh the target page. Use the page console and extension service worker console to inspect diagnostics.

For manual verification, check domain restrictions, widget detection, popup updates, missing-key errors, and failed API responses in a controlled environment. Never include local credentials in screenshots, issue reports, or release archives.
