# PRISMA ATLAS — 30s Promotional Video

A **30-second motion-design promo** for [PRISMA ATLAS](../), built with
[Remotion](https://remotion.dev) (React + TypeScript).

---

## Product Brief

| Field | Details |
|---|---|
| **Product** | PRISMA ATLAS — Piglet Realtime Identification and Sow Monitoring Assistant |
| **Problem** | Newborn piglets are crushed when sows lie down in farrowing crates; incidents often happen at night with no one watching |
| **Audience** | Pig farmers, barn managers, agricultural tech integrators |
| **Top Features** | YOLOv11 real-time posture detection (6 classes) · Crushing-risk alerts in ~50 ms · Unified multi-camera dashboard · Edge installers + PWA |

### Brand Tokens

| Token | Value |
|---|---|
| **Primary (emerald)** | `#059669` / `#10b981` |
| **Accent (rose)** | `#f43f5e` |
| **Background** | `#ffffff` |
| **Surface** | `#f9fafb` |
| **Text** | `#111827` |
| **Font** | Inter (Google Fonts) — also Geist Mono for HUD |
| **Border Radius** | 12 px (cards), 999 px (pills) |

---

## Scene Breakdown (900 frames @ 30 fps = 30 s)

| # | Scene | Frames | Starts at | Key content |
|---|---|---|---|---|
| 1 | **Hook** | 135 | 0 s | Night CCTV feed — "The sow lies down. Her piglets have *seconds*." |
| 2 | **Brand** | 150 | 4 s | Logo pop, wordmark, "Protect Piglets. In Real Time." |
| 3 | **Detection** | 195 | 8.5 s | YOLO bounding boxes on live feed, 6-class chips |
| 4 | **Alerts** | 195 | 14.5 s | Risk gauge 12 → 91 %, three real alert toasts |
| 5 | **Dashboard** | 165 | 20.5 s | Full app window: sidebar, stats, camera tiles |
| 6 | **CTA** | 135 | 25 s | "Protect Piglets. Zero Crushing." + Install click |

15-frame cross-transitions (fade / slide) between each scene.

---

## Commands

### Install dependencies

```bash
npm install
```

### Preview in browser

```bash
npm run dev
```

Opens the Remotion Studio at `http://localhost:3000` — scrub the timeline,
tweak props, and hot-reload.

### Render to MP4

```bash
npx remotion render PrismaAtlasPromo out/prisma-atlas-promo.mp4 --codec h264
```

The output lands in `out/` (git-ignored).

### Add background music

1. Drop an audio file into `public/audio/` (e.g. `music.mp3`).
2. Render with the `music` prop:

```bash
npx remotion render PrismaAtlasPromo out/prisma-atlas-promo.mp4 --props='{"music":"audio/music.mp3"}'
```

The audio auto-fades in over the first 30 frames and out over the last 30.

---

## Project Structure

```
video/
├── public/
│   ├── logo.png          # Pink geometric pig logo
│   ├── farm.png           # Night barn reference image
│   └── audio/             # Drop music files here
├── src/
│   ├── Root.tsx           # Remotion entry — composition registration
│   ├── Promo.tsx          # Master timeline (TransitionSeries)
│   ├── theme.ts           # Colors, fonts, radii, motion presets
│   ├── ui.tsx             # Shared UI primitives (Reveal, Pill, Logo, …)
│   ├── icons.tsx          # SVG icons from the app's Better Icons set
│   ├── components/
│   │   └── CctvFeed.tsx   # Cropped farm.png with YOLO boxes & HUD
│   └── scenes/
│       ├── HookScene.tsx
│       ├── BrandScene.tsx
│       ├── DetectionScene.tsx
│       ├── AlertsScene.tsx
│       ├── DashboardScene.tsx
│       └── CtaScene.tsx
├── remotion.config.ts
├── package.json
└── tsconfig.json
```

---

## License

Video assets (logo, farm image) belong to the PRISMA ATLAS project.
Remotion requires a company license for some entities —
[read the terms](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
