# InEx Ledger - Impeccable Style Spec

Frozen design baseline extracted from the landing page and transactions page.
This document is the source of truth for the rest of the impeccable.style rollout.
Do not change it mid-rollout without a deliberate revision decision.

---

## Color

### Core palette

| Token            | Value         | Role                           |
|------------------|---------------|--------------------------------|
| `--ink`          | `#0f1923`     | Primary text                   |
| `--ink2`         | `#4a5568`     | Secondary text                 |
| `--ink3`         | `#6b7280`     | Muted / helper text            |
| `--surface`      | `#ffffff`     | Primary surface                |
| `--surface2`     | `#f7f8fa`     | Recessed surface / inputs      |
| `--surface3`     | `#eef0f4`     | Chip / toggle background       |
| `--accent`       | `#1a3a5c`     | Dark navy - topbar, tax banner |
| `--accent2`      | `#2563a8`     | Interactive blue - CTAs, links |
| `--accent-light` | `#edf4fb`     | Soft blue tint - kickers, hover|
| `--green`        | `#1a7a4a`     | Income / success               |
| `--green-bg`     | `#eaf5ef`     | Income badge background        |
| `--red`          | `#b91c1c`     | Expense / danger               |
| `--red-bg`       | `#fef2f2`     | Danger badge background        |
| `--amber`        | `#92600a`     | Warning                        |
| `--amber-bg`     | `#fefce8`     | Warning badge background       |
| `--border`       | 9% ink alpha  | Subtle divider                 |
| `--border2`      | 16% ink alpha | Medium divider / input border  |

### Background treatments

- **App background:** `#f4f7fb` - a light, slightly blue-tinted gray. Not white, not gray.
- **App content area:** `linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0) 16%), #f4f7fb` - a subtle white bleed at the top of the content area.
- **Card / panel surface:** `rgba(255,255,255,0.96-0.97)` - near-white, not pure white.
- **Landing background:** `radial-gradient(circle at top left, rgba(36,109,187,0.08), transparent 30%), linear-gradient(180deg, #fbfcfe 0%, #f5f7fb 100%)` - marketing only.
- **Drawer / form inner background:** `linear-gradient(180deg, rgba(245,248,252,0.7), rgba(255,255,255,0))` - subtle depth cue behind form cards.

---

## Typography

### Scale

| Role             | Size    | Weight  | Tracking      | Notes                             |
|------------------|---------|---------|---------------|-----------------------------------|
| Page title       | `34px`  | 700     | `-0.04em`     | App pages                         |
| Panel title      | `24px`  | 700     | `-0.03em`     | Card / panel headers              |
| Drawer title     | `22px`  | 700     | `-0.03em`     | Inline drawers                    |
| Section h2       | `18px`  | 600     | none          | Standard card header              |
| Body             | `14px`  | 400     | none          | Default reading text              |
| Page subtitle    | `14px`  | 400     | none          | line-height `1.62`, color `#5c6977` |
| Secondary / meta | `13px`  | 400-500 | none          |                                   |
| Small / helper   | `12px`  | 400     | none          |                                   |
| Table header     | `11px`  | 700     | `0.08em`      | Uppercase                         |
| Stat label       | `11px`  | 700     | `0.06-0.08em` | Uppercase                         |
| Kicker / eyebrow | `12px`  | 700     | `0.08em`      | Uppercase, pill shape             |

### Font family

```text
-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif
```

Base size: `14px`. Default line-height: `1.5`. Subtitle line-height: `1.62`.

---

## Spacing rhythm

| Token        | Value  | Use                              |
|--------------|--------|----------------------------------|
| `--space-xs` | `8px`  | Tight gaps, icon-to-label        |
| `--space-sm` | `12px` | Form field gap, badge padding    |
| `--space-md` | `16px` | Default section padding          |
| `--space-lg` | `24px` | Page header margin, section gaps |
| `--space-xl` | `32px` | Large section separation         |

Card internal padding: `18-22px`. Toolbar padding: `22px`. Panel-to-panel gap: `22-24px`.

---

## Border radius

| Token         | Value    | Use                                     |
|---------------|----------|-----------------------------------------|
| `--radius`    | `10px`   | Small controls - inputs, action buttons |
| `--radius-lg` | `14px`   | Stat cards, modals, chips, drawers      |
| Literal       | `20px`   | Stat cards                              |
| Literal       | `22-24px`| Main panels, tax banner, transaction panel |
| Literal       | `28px`   | Landing sections                        |
| Literal       | `999px`  | Pills and chips                         |

Rules:
- Small actions and inputs -> `7-14px`
- Cards and panels -> `18-24px`
- Marketing sections -> `22-28px`
- Pills and chips -> `999px`

---

## Shadows

| Name             | Value                                                           | Use               |
|------------------|-----------------------------------------------------------------|-------------------|
| `--shadow-card`  | `0 1px 3px rgba(15,25,35,0.06), 0 1px 2px rgba(15,25,35,0.04)` | Default card      |
| Stat card        | `0 12px 28px rgba(15,25,35,0.05)`                               | Stat cards        |
| Main panel       | `0 14px 32px rgba(15,25,35,0.05)`                               | Transactions panel|
| Tax banner       | `0 18px 34px rgba(17,38,61,0.16)`                               | Dark surface panel|
| Primary button   | `0 14px 24px rgba(36,109,187,0.18)`                             | Blue CTAs         |
| Drawer card      | `0 14px 28px rgba(15,25,35,0.04)`                               | Inline form cards |
| Large modal      | `0 20px 60px rgba(15,25,35,0.18)`                               | Full modals       |

Rule: shadow intensity scales with elevation. Never add shadow to table rows or individual cells.

---

## Action hierarchy

### Primary action

- Background: `linear-gradient(180deg, #2c79c4 0%, #246dbb 100%)` - the blue gradient, not a flat color
- Color: `#fff`
- Border: none
- Border-radius: `14px`
- Min-height: `48px`
- Font-size: `14px`
- Font-weight: `700`
- Shadow: `0 14px 24px rgba(36,109,187,0.18)`
- Hover: `translateY(-1px)` plus stronger shadow
- One per major surface area. Never two primary buttons visible at once.

### Secondary action

- Background: `#fff` or `transparent`
- Border: `1px solid rgba(15,25,35,0.10-0.12)`
- Color: `#223246` or `var(--ink)`
- Border-radius: `14px` or context-matching
- Min-height: `48px`
- Font-weight: `700`

### Quiet / tertiary action

- Background: `var(--surface2)` or `#eef4fb`
- No border, or `0.5px solid var(--border2)`
- Color: `var(--ink2)` or `var(--accent2)`
- Font-weight: `500-700`
- Used for recurring add, CSV import, cancel, and auxiliary controls

### Danger action

- Background: `var(--red)`
- Color: `#fff`
- Border: none
- Only in confirmation contexts - never as a first-click affordance

### Table action buttons

- Min-height: `40px`
- Min-width: `58px`
- Border-radius: `12px`
- Border: `1px solid rgba(15,25,35,0.10)`
- Background: `#fff`
- Font-size: `12px`
- Font-weight: `700`
- Hover: `background: #f8fafc`
- Danger hover: `background: var(--red-bg)`, `color: var(--red)`, `border-color: var(--red)`

---

## Cards

### Stat card

- Background: `rgba(255,255,255,0.96)`
- Border: `1px solid rgba(15,25,35,0.08)`
- Border-radius: `20px`
- Padding: `18px 18px 20px`
- Shadow: `0 12px 28px rgba(15,25,35,0.05)`
- Stat label: `11px`, weight `700`, uppercase, tracking `0.06-0.08em`, color `#6f7987`
- Stat value: `30px`, weight `700`, color `#0f1d2d`
- Stat delta: `12px`, color `var(--ink3)` or semantic color

### Panel / content card

- Background: `rgba(255,255,255,0.97)`
- Border: `1px solid rgba(15,25,35,0.08)`
- Border-radius: `24px`
- Shadow: `0 14px 32px rgba(15,25,35,0.05)`
- No internal padding on the outer panel. Inner sections carry their own padding.

### Inline drawer card

- Background: `#fff`
- Border: `1px solid rgba(15,25,35,0.08)`
- Border-radius: `22px`
- Shadow: `0 14px 28px rgba(15,25,35,0.04)`

### Dark panel

- Background: `linear-gradient(135deg, #143150 0%, #1e4972 100%)`
- Border-radius: `24px`
- Shadow: `0 18px 34px rgba(17,38,61,0.16)`
- Text hierarchy: `#fff`, `rgba(255,255,255,0.72)`, `rgba(255,255,255,0.55)`

---

## Section headers

### Page header

- Title: `34px`, weight `700`, tracking `-0.04em`, color `#102236`
- Subtitle: `14px`, line-height `1.62`, color `#5c6977`, max-width `62ch`
- Context note: pill shape, `border-radius: 999px`, background `rgba(36,109,187,0.08)`, color `var(--accent2)`, `12px`, weight `700`
- Actions aligned to flex-end, gap `12-16px`

### Card / panel header

- Title: `24px`, weight `700`, tracking `-0.03em`, color `#102236`
- Padding: `22px 22px 18px`
- Border-bottom: `1px solid rgba(15,25,35,0.06)`
- Controls stay right-aligned in the same row

### Drawer header

- Title: `22px`, weight `700`, tracking `-0.03em`, color `#102236`
- Separated from form by `border-bottom: 1px solid rgba(15,25,35,0.06)`, `padding-bottom: 18px`, `margin-bottom: 18px`

---

## Tables

- Container: `border-radius: 18px`, `overflow: hidden`, `border: 1px solid rgba(15,25,35,0.06)`, background `#fff`
- `border-collapse: separate`, `border-spacing: 0`
- `thead th`: background `#f7fafc`, `11px`, weight `700`, uppercase, tracking `0.08em`, color `#6d7986`, padding `14px 12px`, `border-bottom: 1px solid rgba(15,25,35,0.06)`
- `tbody td`: padding `14px 12px`, `font-size: 13px`, `border-bottom: 1px solid rgba(15,25,35,0.05)`
- Row hover: `background: #fbfdff`
- Last row: no border-bottom
- Amount column: right-aligned
- Actions column: right-aligned with flex gap `6px`

---

## Inputs and form controls

- Min-height: `48px`
- Border-radius: `14px`
- Border: `1px solid rgba(15,25,35,0.10)`
- Background: `#fbfcfe`
- Font-size: `14px`
- Focus: `border-color: rgba(36,109,187,0.45)`, `box-shadow: 0 0 0 4px rgba(36,109,187,0.08)`
- Labels: `12px`, weight `700`, tracking `0.02em`, color `#6a7684`
- Label-to-input gap: `6px`
- Textarea min-height: `110px`

---

## Pills and chips

### Period picker chips

- Container: `border-radius: 16px`, background `rgba(15,25,35,0.04)`, `padding: 6px`
- Chip: `border-radius: 999px`, `min-height: 40px`, `padding: 0 14px`, `font-size: 13px`, weight `700`, color `#5e6978`
- Chip hover: `background: rgba(255,255,255,0.86)`
- Chip active: `background: var(--accent2)`, `color: #fff`, `border-color: var(--accent2)`, `box-shadow: 0 10px 20px rgba(36,109,187,0.18)`

### Kicker / eyebrow pill

- `border-radius: 999px`, `min-height: 30-32px`, `padding: 0 10-12px`
- Background: `var(--accent-light)`
- Border: `1px solid rgba(36,109,187,0.14)`
- Color: `var(--accent2)`
- Font: `12px`, weight `700`, uppercase, tracking `0.08em`

### Category pill

- `border-radius: 20px`, `padding: 3px 8px`, `font-size: 11px`, weight `700`
- Tone variants: consulting (blue), income (green), travel (amber), office (purple), marketing (red), default (`surface2`)

### Status badge

- `border-radius: 999px`, `min-width: 74px`, `padding: 4px 8px`, `font-size: 11px`, weight `500`
- Pending: `background: var(--surface2)`, border `var(--border2)`, color `var(--ink2)`
- Cleared: `background: rgba(16,185,129,0.12)`, border `rgba(16,185,129,0.25)`, color `var(--green)`

### Meta badge

- `border-radius: 999px`, `padding: 2px 8px`, `font-size: 10px`, weight `600`
- Default: `background: var(--surface2)`, color `var(--ink2)`
- Semantic variants:
  - fx / tax -> blue tint
  - capital -> amber tint
  - needs_review / locked / split -> red tint
  - matched / ready -> green tint

---

## Empty states

Pattern:

- Centered in the panel
- Short heading: `16-18px`, weight `600`, color `var(--ink)`
- One-line descriptor: `14px`, color `var(--ink3)`
- Optional primary action below
- No decorative illustration without meaning

---

## Upsell pattern

- Same card container as a panel: `border-radius: 24px`, white background, soft border, soft shadow
- Compact. Do not make upsell cards taller than `80-100px`
- One sentence explaining the unlock
- One primary action button
- Never show the upsell alongside the feature it replaces

---

## Topbar / shell

- Background: `var(--accent)` = `#1a3a5c`
- Min-height: `56px`
- Sticky, `z-index: 40`
- Brand mark: `28x28px`, `border-radius: 7px`
- Nav links: `13px`, color `rgba(255,255,255,0.82)`, active background `rgba(255,255,255,0.15)`, active text `#fff`
- User pill: background `rgba(255,255,255,0.95)`, `border-radius: 20px`, `padding: 5px 12px 5px 5px`
- User avatar: `28x28px` circle, background `#dbeafe`, color `#1e40af`, `11px`, weight `600`

---

## Sidebar

- Width: `200px` for transactions, `224px` for dynamic sidebar
- Background: `var(--surface)`
- Border-right: `0.5px solid var(--border)`
- Links: `13px`, color `var(--ink2)`, `padding: 8px 10px`, `border-radius: 8px`
- Active: `color: var(--accent2)`, weight `600`, no fill background
- Hover: `background: var(--surface2)`
- Section labels: `10px`, weight `500`, uppercase, tracking `0.08em`, color `var(--ink3)`

---

## Modals and drawers

### Full modal

- Backdrop: `rgba(15,25,35,0.45)`, fixed inset `0`, `z-index: 1000`
- Modal box: `border-radius: 14px`, `padding: 28px`, `max-width: calc(100vw - 32px)`
- Shadow: `0 20px 60px rgba(15,25,35,0.18)`
- Danger variant adds red icon circle and danger CTA

### Inline drawer

- Slides into the panel below the toolbar - not a floating overlay
- Separated from above by a bottom border, wrapped in a card with radius `22px`
- Container background: `linear-gradient(180deg, rgba(245,248,252,0.7), rgba(255,255,255,0))`
- No backdrop - it is part of page flow

---

## Allowed section separators

- `border-bottom: 1px solid rgba(15,25,35,0.06)` - within a panel
- `0.5px solid var(--border)` - between sidebar items and recurring panel borders
- Gap between cards: `14-24px`
- No `<hr>` unless it is replacing a real border case intentionally

---

## Copy tone rules

- Direct and operational. Not friendly-robot.
- Titles describe the surface, not the benefit.
- Subtitles are factual.
- CTAs follow verb plus object.
- Empty states say what to do next.
- Upsell copy stays to one sentence and a specific benefit.

---

## Responsive breakpoints

| Breakpoint | Behavior                                             |
|------------|------------------------------------------------------|
| `1180px`   | Toolbar grid collapses to two columns                |
| `1100px`   | Topbar nav collapses help/messages/settings to icons |
| `1024px`   | Sidebar hides, hamburger appears                     |
| `900px`    | Content padding tightens, sidebar goes horizontal    |
| `820px`    | App shell goes column, sidebar goes horizontal grid  |
| `640px`    | Page header stacks, actions stretch full-width       |
| `520px`    | Single-column sidebar, everything full-width         |
| `480px`    | Table scrolls, period chips split 50/50             |

---

## What is explicitly not allowed

- One-off purple or indigo gradients from the old direction
- `border-radius: 999px` on non-pill elements
- `transform: translateY(-2px)` on table rows
- `box-shadow` on table rows or individual cells
- Inline `!important` spacing overrides when they can be removed in Phase 1
- Generic shadow fallbacks like `var(--shadow-soft, 0 10px 25px rgba(0,0,0,0.08))`
- Flat gradient-pill button mixes in the same action row

---

*Phase 0 complete. This spec is frozen. Move to Phase 1.*
