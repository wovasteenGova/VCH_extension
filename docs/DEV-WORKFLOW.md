# Local development (hot reload)

Use this while changing extension code. You do **not** need to click **Reload** on every save.

## One-time setup

1. In a terminal: `npm run dev` (leave it running).
2. On Edge: `edge://extensions` → **Load unpacked** →  
   `VCH_extension\.output\chrome-mv3-dev`  
   (not `chrome-mv3`, which is production build only).
3. Pin the extension.

## Day to day

| What changed | What you do |
|--------------|-------------|
| Popup (tabs, Letters, footer) | Save in the editor. WXT reloads the extension. **Close and reopen** the popup. |
| VA.gov bar (content script) | After WXT reloads, **refresh the VA tab** (Ctrl+Shift+R) once. |
| Background / manifest | WXT reloads; reopen popup. Refresh VA tabs if something feels stale. |

WXT prints `Built extension` in the terminal each time it picks up changes.

## Production check (before release)

```bash
npm test
npm run build
```

Load or reload from `.output\chrome-mv3` when you want to match the shipped zip.

## Two folders

| Folder | Command | Use |
|--------|---------|-----|
| `.output/chrome-mv3-dev` | `npm run dev` | Daily development |
| `.output/chrome-mv3` | `npm run build` | Release / manual QA of final bundle |

Only one unpacked load is needed if you use **dev** during active work.
