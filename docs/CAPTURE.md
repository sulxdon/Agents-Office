# Regenerating README captures

All screenshots and the GIF in the README are captured from the real app —
no mockups. The pipeline is two scripts:

```bash
# 1. Start the app (fresh DB recommended for clean shots)
npm run dev

# 2. In another shell, drive the app and screenshot it (~2.5 min).
#    Uses a clean browser profile, sends the sample goal, captures
#    welcome / working / artifacts / brief / usage / agent / settings.
node docs/capture.mjs

# 3. Assemble the GIF from the captured frames (pure JS, no ffmpeg).
node docs/make-gif.mjs
```

Assets land in `docs/assets/`:

| File | What it is |
| ---- | ---------- |
| `office-live.gif` | 16-frame loop of the crew mid-run |
| `office-working.png` | Full app during a live run (hero) |
| `welcome.png` | First-run onboarding tour |
| `agent-card.png` | Agent card with Live thinking feed |
| `artifacts.png` | Deliverables workspace |
| `brief.png` | Manager brief |
| `usage.png` | API usage dashboard |
| `settings.png` | BYO keys + model settings |
| `logo.svg` / `banner.svg` | Brand assets (also `app/icon.svg` favicon) |
| `architecture.svg` | How-it-works diagram |

First-time setup for captures: `npx playwright-core install chromium`
(devDependency `playwright-core` is already listed; `upng-js` + `gifenc`
assemble the GIF with zero native deps).

Tip: for pristine shots, run the dev server against a scratch database so no
test data leaks in: `AGENT_OFFICE_DB=data/capture.sqlite npm run dev`
(PowerShell: `$env:AGENT_OFFICE_DB='data/capture.sqlite'; npm run dev`),
and temporarily move `data/artifacts/` aside. Delete the scratch DB after.
