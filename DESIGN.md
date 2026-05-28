# Chauffeur Empire — Design System

## Visual Identity

**eRepublik Flat** — dark, minimal, data-dense. Inspired by eRepublik / eRevolution. Zero decoration, maximum information.

## Palette

| Token | Value | Usage |
|---|---|---|
| Background page | `#0d1117` | `<body>` |
| Card background | `#161b22` | All cards, panels |
| Card border | `1px solid #21262d` | All card borders |
| Text primary | `#e6edf3` | Headlines, values |
| Text muted | `#8b949e` | Labels, secondary |
| Text dim | `#6b7280` | Section headers, timestamps |
| Gold text | `#d4af37` | Prices, premium |
| Gold border | `#b8962b` | Gold button borders |
| Gold bg | `#1a1608` | Gold button background |
| Green | `#3fb950` | Positive, active, success |
| Blue | `#58a6ff` | Info, links, VTK |
| Red | `#f85149` | Danger, loss, fines |
| Orange | `#f59e0b` | Warning, caution |
| Purple | `#c084fc` | Premium tiers |
| Font mono | `monospace` | Numbers, stats, codes |

## Rules

- **Zero** neon, glow, glassmorphism, drop-shadows on decorative elements
- **Everything inline** — all styles go on HTML elements in JS template literals, no Tailwind classes
- Border-radius: `6px` on cards, `4px` on buttons/inputs/badges
- All buttons: `transition:opacity .15s` + `onmousedown scale(0.97)`

## Component Patterns

### Page header
```html
<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
  <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EYEBROW</div>
  <div style="font-size:20px;font-weight:700;color:#e6edf3">TITLE</div>
  <div style="font-size:11px;color:#8b949e;margin-top:4px">SUBTITLE</div>
</div>
```

### KPI grid (4 columns)
```html
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
  <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">LABEL</div>
    <div style="font-size:20px;font-weight:700;color:#VALUE_COLOR;font-family:monospace">VALUE</div>
  </div>
</div>
```

### Card
```html
<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:16px">
```

### Card (colored state)
```html
<!-- Gold / active -->
background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.25)
<!-- Green / success -->
background:rgba(63,185,80,0.04);border:1px solid rgba(63,185,80,0.2)
<!-- Red / danger -->
background:rgba(248,81,73,0.04);border:1px solid rgba(248,81,73,0.25)
<!-- Blue / info -->
background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.18)
```

### Section sub-header
```html
<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #21262d">SECTION</div>
```

### Badge / pill
```html
<!-- green -->
<span style="font-size:9px;font-weight:700;color:#3fb950;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:2px 6px">ACTIVE</span>
<!-- red -->
<span style="font-size:9px;font-weight:700;color:#f85149;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.3);border-radius:4px;padding:2px 6px">ERROR</span>
<!-- gold -->
<span style="font-size:9px;font-weight:700;color:#d4af37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:2px 6px">GOLD</span>
<!-- blue -->
<span style="font-size:9px;font-weight:700;color:#58a6ff;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);border-radius:4px;padding:2px 6px">INFO</span>
```

### Button: gold (primary CTA)
```html
<button style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s"
  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
```

### Button: ghost
```html
<button style="background:#161b22;border:1px solid #21262d;color:#8b949e;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s"
  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
```

### Button: destructive
```html
<button style="background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s"
  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
```

### Table (TH helpers in JS)
```js
const _TH  = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
const _THR = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
```
Table TD: `padding:8px 14px;font-size:11px;color:#e6edf3;border-bottom:1px solid #161b22`

### Progress bar
```html
<div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden">
  <div style="height:100%;width:${pct}%;background:#3fb950;border-radius:3px;transition:width .3s"></div>
</div>
```

### Empty state
```html
<div style="text-align:center;padding:40px 0">
  <div style="font-size:32px;margin-bottom:10px">ICON</div>
  <div style="font-size:14px;font-weight:600;color:#e6edf3">TITLE</div>
  <div style="font-size:11px;color:#8b949e;margin-top:4px">BODY</div>
</div>
```

### Info box (blue)
```html
<div style="background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.18);border-radius:6px;padding:14px;font-size:11px;color:#79c0ff;line-height:1.6">
```

## Tab header pattern (full with badge)
```html
<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
  <div>
    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EYEBROW</div>
    <div style="font-size:20px;font-weight:700;color:#e6edf3">TITLE</div>
    <div style="font-size:11px;color:#8b949e;margin-top:4px">SUBTITLE</div>
  </div>
  <span style="font-size:9px;font-weight:700;color:COLOR;background:BG;border:1px solid BORDER;border-radius:4px;padding:3px 8px">BADGE</span>
</div>
```

## Typography

| Use | Size | Weight | Color | Family |
|---|---|---|---|---|
| Eyebrow | 9px | 700 | `#6b7280` | default |
| Page title | 20px | 700 | `#e6edf3` | default |
| Section header | 9px | 600 | `#6b7280` | monospace |
| Card title | 12–13px | 700 | `#e6edf3` | default |
| Body text | 11px | 400 | `#e6edf3` | default |
| Muted text | 10px | 400 | `#8b949e` | default |
| Dim text | 9px | 400 | `#6b7280` | default |
| Numbers/stats | any | 700 | varies | monospace |
| Table headers | 9px | 600 | `#6b7280` | monospace |

## Micro-interaction rule

Every interactive element must have:
```
transition:opacity .15s
onmousedown="this.style.transform='scale(0.97)'"
onmouseup="this.style.transform=''"
onmouseleave="this.style.transform=''"
```

## Tab completion status

✅ Done (eRepublik flat): home, dispatch, fleet, staff, finance, ranking, emails, marketing, investments, real-estate, lifestyle, politics, career (modal), ops, legal, help, hq, store, market, shadow, nemesis, crypto, b2b, auctions, contracts, tourism

🔲 Not started: war_room, showroom (partially)
