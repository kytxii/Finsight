# Design System

A portable spec for building dense, dark, data-first product UI. This is a
**rulebook**, not a description — new work follows it, and code that predates it
gets migrated, not grandfathered.

Stack assumptions: Tailwind v4 (`@tailwindcss/vite`), React, no component library.

---

## Principles

1. **One theme.** Dark only. No light mode, no `prefers-color-scheme`, no theme
   toggle. Every surface value is a constant, not a branch.
2. **Dense by default.** This is a data tool, not a marketing page. Small type,
   tight spacing, high information per screen.
3. **Depth from light, not from shadow.** Surfaces separate by lightness and a
   hairline. Drop shadows mean "floating above the page" and nothing else.
4. **Color carries meaning.** Every hue in the UI is either a semantic state or
   an entity's identity. Nothing is colored for decoration.
5. **Motion clarifies state change.** Controls morph into each other instead of
   popping in and out.

---

## Foundations

### Color

Four roles, and nothing outside them.

**Surfaces** — three fixed depths, always in this order:

| Token | Value | Use |
|---|---|---|
| `bg` | `#040e11` | Page canvas. The furthest-back layer. |
| `surface` | `#0e1b21` | Cards, panels, sheets, rows. |
| `field` | `#08131a` | Inputs and wells — *darker* than the surface they sit on. |
| `line` | `rgba(255,255,255,0.09)` | Every border. One hairline value, no variants. |

Inputs recede and cards advance. An input lighter than its card is wrong.

**Ink** — three weights: `ink` `#ffffff` for primary content, `muted` `#8e8e93`
for labels and secondary text, `faint` `#55555c` for chevrons, placeholders and
disabled states. There is no fourth.

**Accent** — one accent for the whole product, used for primary actions and
focus. `accent` `#14b8a6`, with `accent-ink` `#04140f` for text on an accent
fill (never white — the fill is too light) and `accent-deep` `#0f766e` for
ambient glow behind it.

**Semantic** — `positive` `#52b757`, `negative` `#ef5350`, `info` `#4493f8`,
`notice` `#90a4ae`. `notice` exists so system-level alerts read as distinct from
any entity hue; keep it desaturated for that reason.

#### The entity-hue rule

**Every top-level entity type owns exactly one hue, and that hue follows it
everywhere** — its list tile, its icon, its chart series, its badge, its detail
page accent, its focus ring. A user learns the color once and then navigates by
it. Corollaries:

- An entity's hue is assigned once, in the token block. Components read it; they
  never pick a color.
- Two entities never share a hue.
- Never reuse an entity hue for a semantic state, or vice versa. If "overdue"
  needs a color, it is `negative` — not the red-ish entity.
- The set is closed. Adding an entity means adding a token, not improvising.

Worked example (a finance app's eight entities) — remap the names to your domain
and keep the hues, or remap both:

| Entity | Hue |
|---|---|
| Income | `#52b757` |
| Expense | `#ef5350` |
| Bill | `#1e88e5` |
| Subscription | `#ab47bc` |
| Debt | `#fb8c00` |
| Reimbursement | `#e91e63` |
| Savings | `#e0b020` |
| Tips | `#26a69a` |

**Ramp** — for gauges, utilization bars and any good-to-bad scale, use the
five-step ramp (`#43a047` → `#8bc34a` → `#e0b020` → `#fb8c00` → `#ef5350`).
Never interpolate your own.

### Typography

**Plus Jakarta Sans**, loaded from Google Fonts with preconnects and the full
variable range:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap" rel="stylesheet">
```

Seven steps, by role. **Nothing lands between steps** — no 14, no 16, no 17.

| Role | Size | Weight | Use |
|---|---|---|---|
| `micro` | 10px | 600 | All-caps labels only, with letter-spacing. Never a sentence. |
| `meta` | 11px | 500–600 | Timestamps, counts, secondary row detail. |
| `body` | 12px | 500–600 | Default. Most text in the app is this. |
| `emph` | 13px | 600–700 | Row titles, amounts, anything scanned. |
| `title` | 15px | 700 | Card and section headers. |
| `page` | 20px | 700 | Page titles. |
| `hero` | 30px | 800 | The one big figure on a screen. |

Weights are **500, 600, 700, 800** — never 400 (too thin at 12px on a dark
background) and never 900. Body copy at 12/500 is the floor; go to 600 before
going to 13.

### Spacing

**2px grid**, 4–16 for anything inside a screen, 24/32 between page-level
sections. Setting `--spacing: 2px` makes Tailwind's numeric utilities step by 2,
so `gap-3` is 6px and `p-5` is 10px.

| Step | Use |
|---|---|
| 4px | Inside a tight control — icon to its label. |
| 6px | Between adjacent controls in a group. |
| 8px | Default gap. Between fields, between chips. |
| 10–12px | Row padding; between rows in a list. |
| 14–16px | Card padding; between cards. |
| 24–32px | Between page sections only. |

### Radius

Four values. Everything else is drift.

| Token | Value | Use |
|---|---|---|
| `control` | 6px | Buttons, chips, small inputs, icon buttons. |
| `card` | 10px | Cards, panels, list rows, larger inputs. |
| `sheet` | 16px | Modals, bottom sheets, sliding panels. |
| `full` | 999px / 50% | Pills, toggles, badges, avatars, dots. |

A bottom sheet rounds its top corners only: `16px 16px 0 0`.

### Elevation

Depth comes from **surface lightness + a hairline + a top bevel**. In order:

1. The surface token itself does most of the work.
2. A 1px `line` border defines the edge.
3. **Bevel:** `inset 0 1px 0 rgba(255,255,255,0.12)` on raised, pressable
   elements — buttons, chips, cards a user can act on. It reads as a light
   source above the screen. Use `0.16` on accent-filled elements, where the
   brighter background needs a stronger highlight to show.

**Drop shadows are only for elements floating above the page** — never on a card
sitting in the layout:

- Popovers, menus, dropdowns: `0 12px 28px rgba(0,0,0,0.4)`
- Modals and full sheets: `0 24px 64px rgba(0,0,0,0.5)`

### Motion

Three durations, always in **ms**, always `ease`:

| Duration | Use |
|---|---|
| **150ms** | Color and state — hover, active, background, border. |
| **200ms** | Transform and opacity — morphs, fades, scale. |
| **300ms** | Layout — page slides, panel open/close, width. |

Rules:

- Never `transition: all`. Name the properties.
- Never CSS `s` units — `150ms`, not `0.15s`. Mixed units are the single most
  common inconsistency; grep transitions for `0.` to catch them.
- Every animation respects `prefers-reduced-motion` (see base CSS below).

---

## Token block

Paste into `index.css`. This is the whole system.

```css
@import "tailwindcss";

@theme {
  /* Type */
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;

  --text-micro: 10px;
  --text-meta:  11px;
  --text-body:  12px;
  --text-emph:  13px;
  --text-title: 15px;
  --text-page:  20px;
  --text-hero:  30px;

  /* Spacing — 2px grid. NOTE: this halves every numeric utility relative to
     stock Tailwind. p-4 is 8px here, not 16px. */
  --spacing: 2px;

  /* Radius */
  --radius-control: 6px;
  --radius-card:    10px;
  --radius-sheet:   16px;
  --radius-full:    999px;

  /* Surfaces */
  --color-bg:      #040e11;
  --color-surface: #0e1b21;
  --color-field:   #08131a;
  --color-line:    rgba(255, 255, 255, 0.09);

  /* Ink */
  --color-ink:   #ffffff;
  --color-muted: #8e8e93;
  --color-faint: #55555c;

  /* Accent */
  --color-accent:      #14b8a6;
  --color-accent-ink:  #04140f;
  --color-accent-deep: #0f766e;

  /* Semantic */
  --color-positive: #52b757;
  --color-negative: #ef5350;
  --color-info:     #4493f8;
  --color-notice:   #90a4ae;

  /* Entity hues — rename per domain, one per top-level entity */
  --color-entity-income:        #52b757;
  --color-entity-expense:       #ef5350;
  --color-entity-bill:          #1e88e5;
  --color-entity-subscription:  #ab47bc;
  --color-entity-debt:          #fb8c00;
  --color-entity-reimbursement: #e91e63;
  --color-entity-savings:       #e0b020;
  --color-entity-tips:          #26a69a;

  /* Ramp — good to bad */
  --color-ramp-0: #43a047;
  --color-ramp-1: #8bc34a;
  --color-ramp-2: #e0b020;
  --color-ramp-3: #fb8c00;
  --color-ramp-4: #ef5350;

  /* Elevation */
  --shadow-bevel:        inset 0 1px 0 rgba(255, 255, 255, 0.12);
  --shadow-bevel-strong: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  --shadow-overlay:      0 12px 28px rgba(0, 0, 0, 0.4);
  --shadow-modal:        0 24px 64px rgba(0, 0, 0, 0.5);
}

html, body {
  /* Sliding panels translate fixed elements past the viewport edge; some
     browsers still count that geometry as scrollable and flash a scrollbar. */
  overflow-x: hidden;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-ink);
}

* {
  -webkit-tap-highlight-color: transparent;
}

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

Force the theme once at the entry point rather than tracking it in state:

```js
document.documentElement.classList.add("dark");
```

---

## How to apply it

**Tailwind first, including color.** Classes are the default:
`bg-surface border-line rounded-card p-6 text-body text-muted`. Because every
token above is a real Tailwind theme entry, there is no reason to hand-write hex.

**Inline `style` is for values computed at runtime only** — an entity hue
resolved from data, an animated offset, a measured width:

```jsx
<div
  className="rounded-card border p-6 shadow-bevel"
  style={{ borderColor: entityHue }}
/>
```

Not allowed:

- A hex literal in a component. If a color isn't in the token block, it isn't in
  the design system.
- A one-off `fontSize` or `borderRadius`. Use the scale.
- A `dark ?` ternary or a `dark:` variant. There is one theme.
- Inline styles that duplicate a utility (`style={{ display: "flex" }}`).

---

## Interaction patterns

These four are what make the UI feel deliberate rather than assembled. Carry
them into any project using this system.

### Arm-then-confirm destructive actions

Destructive actions never fire on first click and never open a dialog. The
control swaps in place to a `negative`-colored **"Confirm?"** label and disarms
itself after ~3s if ignored. The second click commits.

```jsx
function requestDelete(id, action) {
  if (armedId !== id) {
    setArmedId(id);
    setTimeout(() => setArmedId((prev) => (prev === id ? null : prev)), 3000);
    return;
  }
  setArmedId(null);
  action();
}
```

No `window.confirm()`. No modal for a single-row delete — the confirmation lives
where the click happened.

### Morphing affordances

Controls **transform into each other** rather than appearing and disappearing.
The canonical case: a three-dot menu that rotates and scales into edit/delete
icons.

Both states stay mounted, absolutely positioned in the same box, cross-faded on
opacity and transform over 200ms, with `pointerEvents` gating the inactive one
so it can't be clicked mid-transition. The container has a **fixed width and
height** so nothing around it reflows.

```jsx
<div style={{ position: "relative", width: 56, height: 20, flexShrink: 0 }}>
  <div style={{
    position: "absolute", inset: 0,
    opacity: open ? 0 : 1,
    transform: open ? "rotate(90deg) scale(0.5)" : "rotate(0deg) scale(1)",
    transition: "opacity 200ms ease, transform 200ms ease",
    pointerEvents: open ? "none" : "auto",
  }}>
    {/* collapsed state */}
  </div>
  <div style={{
    position: "absolute", inset: 0,
    opacity: open ? 1 : 0,
    transform: open ? "scale(1)" : "scale(0.6)",
    transition: "opacity 200ms ease, transform 200ms ease",
    pointerEvents: open ? "auto" : "none",
  }}>
    {/* expanded state */}
  </div>
</div>
```

### Accent-derived focus rings

Focus and selection use a ring mixed from **whatever hue owns the current
context**, not one global focus color — so focusing a field on an entity's page
reinforces that entity's identity:

```js
boxShadow: `0 0 0 2px color-mix(in srgb, ${activeColor} 20%, transparent)`
```

2px, 20% mix, always. Never remove a focus ring without replacing it with an
equally visible state.

### Icons

Inline SVG only — no icon font, no icon package. `currentColor` for fill or
stroke so icons inherit their context. 15px in dense rows, 17px for standalone
buttons, `strokeWidth={2}` with round caps and joins.

---

## Review checklist

- [ ] No hex literal outside the token block
- [ ] No `dark:` variant, no theme ternary
- [ ] Type on one of the seven steps; weight 500–800
- [ ] Radius is control / card / sheet / full
- [ ] Spacing lands on the 2px grid
- [ ] Drop shadow only if the element floats above the page
- [ ] Transitions in ms, named properties, never `all`
- [ ] Destructive action arms before it fires
- [ ] Focus state visible and derived from the active hue
- [ ] Inputs darker than the surface behind them
