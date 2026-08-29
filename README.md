# Burr
#### Notes that stick 
Leave notes on sites

Burr is a lightweight, private browser extension that attaches notes and reminders to websites. Notes live entirely within your browser profile and can reappear when you return to that domain after a set amount of time, reminding you to do something.

## Features

- **Domain-anchored notes**: Notes attach to registrable domains (such as `example.com` or `bbc.co.uk`) and automatically display when browsing any page under that domain.
- **Reminders and arrival alerts**: Set reminders for any custom date and time. When you visit a site with an overdue note, Burr pops the note up and reminds you. Snooze available.
- **Adaptive color palettes**: Choose from a curated selection of card colors with dynamic text contrast.
- **Private and local-first**: All note data is stored exclusively in `browser.storage.local`. No external servers, no tracking, and no telemetry.
- **Export and import**: Backup and restore your notes at any time through the options page via JSON export.

## Manual Installation

### Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...**
3. Select `manifest.json` in the root directory.

### Chrome / Chromium

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and choose the repository folder.

# License
Source-available under the terms of the license in `LICENSE`.
