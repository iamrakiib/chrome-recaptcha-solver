# Repository guidance

## Scope

This repository contains a Chrome Manifest V3 extension targeting Google reCAPTCHA v2 pages through the 2Captcha API. Source JavaScript and HTML are loaded directly; there is no build system or automated test suite.

## Files

- background.js: API requests, polling, domain checks, and runtime message handling.
- content.js: DOM scanning, session tracking, token delivery, and submission attempts.
- inject.js: page-context hooks, widget registry scanning, and callback delivery.
- popup.html and popup.js: toolbar status interface.
- config.example.js: public configuration template.
- config.js: private local configuration, excluded from Git.

## Maintenance

- Keep API keys and personal details out of tracked files and diagnostic logs.
- Update all manifest domain patterns together with ALLOWED_DOMAIN when changing targets.
- Only reCAPTCHA v2 is supported by the current background solve path. Do not document the additional library hooks as complete support.
- Preserve extension behavior unless a change is explicitly requested.
- Load unpacked through chrome://extensions for manual checks. Keep credentials out of release archives and screenshots.
