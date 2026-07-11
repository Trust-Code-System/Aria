# Aria Chrome extension

Side-panel companion for [Aria](https://aria-vert-chi.vercel.app) — open chat beside any tab.

## Install (unpacked)

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → choose this folder
4. Pin Aria and click it (or **Alt+A**)

## Configure

Options → set App URL (production or `http://localhost:3000`).

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 + side panel |
| `background.js` | Open panel on icon click |
| `sidepanel.*` | Panel UI + iframe to Aria |
| `options.*` | App URL setting |
| `icons/` | Toolbar icons |
