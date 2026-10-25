# Design Guide

Fallback reference when the `frontend-design`, `humanizer`, and `animate` skills are not installed. Follow these rules for every landing page you build.

---

## The AI Slop Test

If you showed this interface to someone and said "AI made this," would they believe you immediately? If yes, redesign it.

A distinctive interface should make someone ask "how was this made?" — not "which AI made this?"

---

## Tailwind v4 Token Setup (read this before writing any CSS)

`create-next-app@latest` scaffolds **Tailwind CSS 4**. There is **no `tailwind.config.ts`**
and there must not be one. In v4 a custom property becomes a utility class only if it is
declared inside a `@theme` block under a recognized namespace:

| Namespace | Declaring | Generates |
|-----------|-----------|-----------|
| `--color-*` | `--color-primary` | `bg-primary`, `text-primary`, `border-primary`, `ring-primary` |
| `--text-*` | `--text-fluid-xl` | `text-fluid-xl` |
| `--spacing-*` | `--spacing-section` | `py-section`, `px-section`, `gap-section`, `mt-section` |
| `--font-*` | `--font-heading` | `font-heading` |
| `--ease-*` | `--ease-out` | `ease-out` |
| `--radius-*` | `--radius-lg` | `rounded-lg` |

**A `--color-primary` declared in plain `:root` generates nothing.** `bg-primary` will not
exist and the class will silently do nothing. This is the single most common way to ship a
page where half the styling is missing and nothing errors.

Use `@theme inline` when the value points at another custom property that is re-bound at
runtime (anything that changes under `.dark`) — `inline` is what makes `bg-primary/90`
opacity modifiers resolve correctly. Use plain `@theme` for static values like `clamp()`
literals and cubic-beziers.

`shadcn init` writes `site/src/app/globals.css` already containing `@import "tailwindcss"`,
an `@theme inline` map, and `:root` / `.dark` token blocks. **Edit the VALUES in `:root` and
`.dark`; append your own `@theme` block. Never overwrite the file.**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));   /* replaces v3's darkMode: ["class"] */

/* 1. SEMANTIC TOKENS — shadcn's contract. Every generated component reads these
      names. Put your OKLCH brand values here. Do not rename them. */
:root {
  --radius: 0.625rem;
  --background:         oklch(98% 0.010 250);
  --foreground:         oklch(15% 0.020 250);
  --primary:            oklch(55% 0.150 250);
  --primary-foreground: oklch(98% 0.010 250);
  --accent:             oklch(65% 0.200  30);
  --muted:              oklch(95% 0.015 250);
  --muted-foreground:   oklch(45% 0.020 250);
  --border:             oklch(90% 0.015 250);
  --ring:               oklch(55% 0.150 250);
}

/* Dark is NOT inverted light: different surfaces, REDUCED chroma on accents,
   and borders as translucent white rather than a solid grey. */
.dark {
  --background:         oklch(17% 0.020 250);
  --foreground:         oklch(94% 0.010 250);
  --primary:            oklch(72% 0.110 250);
  --primary-foreground: oklch(17% 0.020 250);
  --accent:             oklch(72% 0.140  30);
  --muted:              oklch(27% 0.025 250);
  --muted-foreground:   oklch(68% 0.018 250);
  --border:             oklch(100% 0 0 / 12%);
  --ring:               oklch(72% 0.110 250);
}

/* 2. TOKEN -> UTILITY MAP — written by shadcn init. `inline` is required so
      bg-primary follows .dark at runtime. Do not delete. */
@theme inline {
  --color-background:         var(--background);
  --color-foreground:         var(--foreground);
  --color-primary:            var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent:             var(--accent);
  --color-muted:              var(--muted);
  --color-muted-foreground:   var(--muted-foreground);
  --color-border:             var(--border);
  --color-ring:               var(--ring);
  --radius-lg: var(--radius);

  /* next/font emits --font-display and --font-text on <body>. The source names
     MUST differ from the theme keys, or the mapping self-references and resolves
     to nothing. */
  --font-heading: var(--font-display);
  --font-body:    var(--font-text);
  --font-sans:    var(--font-text);
}

/* 3. PROJECT TOKENS — you append this. Static values, so plain @theme. */
@theme {
  --text-fluid-sm:   clamp(0.875rem, 0.80rem + 0.35vw, 1rem);
  --text-fluid-base: clamp(1rem,     0.90rem + 0.50vw, 1.125rem);
  --text-fluid-lg:   clamp(1.25rem,  1.00rem + 1.25vw, 1.75rem);
  --text-fluid-xl:   clamp(1.75rem,  1.20rem + 2.75vw, 3rem);
  --text-fluid-2xl:  clamp(2.25rem,  1.50rem + 3.75vw, 4.5rem);

  --spacing-section:   clamp(4rem,   8vw, 8rem);
  --spacing-component: clamp(1.5rem, 3vw, 3rem);
  --spacing-element:   clamp(0.5rem, 1vw, 1rem);

  --ease-out:    cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  /* Overwrite the scaffold's `font-family: Arial, Helvetica, sans-serif` —
     Arial is on this guide's banned list and create-next-app hardcodes it. */
  body { @apply bg-background text-foreground font-body; }
  h1, h2, h3 { @apply font-heading; }
}
```

The `fluid-` prefix on the type scale is deliberate: naming them `--text-xl` would silently
replace Tailwind's built-in `text-xl` everywhere, including inside generated shadcn
components. Additive is safer.

**Two things that do NOT carry over from v3:** there is no `container` config (use
`mx-auto max-w-6xl px-6`), and `tailwindcss-animate` is replaced by `tw-animate-css`, which
`shadcn init` installs. Do not hand-add either.

---

## Typography

**Load fonts via `next/font/google`.** Never use CDN links or system fonts.

### Banned Fonts
Inter, Roboto, Arial, Open Sans, Helvetica, system-ui defaults. These are the AI defaults.

### Recommended Pairings by Vibe

| Vibe | Headline | Body |
|------|----------|------|
| Elegant / Luxury | Playfair Display, Cormorant Garamond, EB Garamond | Lora, Source Serif 4, Crimson Text |
| Modern / Clean | Space Grotesk, Outfit, Plus Jakarta Sans | DM Sans, Manrope, Nunito Sans |
| Bold / Impactful | Syne, Clash Display (variable), Unbounded | Work Sans, Karla, Rubik |
| Playful / Warm | Fredoka, Baloo 2, Comfortaa | Quicksand, Poppins, Nunito |
| Professional | Instrument Serif, Literata, Fraunces | Inter (only as body with a distinctive headline), Atkinson Hyperlegible |
| Edgy / Experimental | Space Mono, JetBrains Mono, Major Mono Display | IBM Plex Sans, Geist Sans |

### Font Loading Pattern
```tsx
import { Space_Grotesk, DM_Sans } from "next/font/google";

// Source variable names MUST differ from the Tailwind theme keys
// (--font-heading / --font-body), or the @theme inline mapping
// self-references and resolves to nothing.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const text = DM_Sans({
  subsets: ["latin"],
  variable: "--font-text",
  display: "swap",
});

// In layout.tsx:
<body className={`${display.variable} ${text.variable} antialiased`}>
```

`globals.css` bridges these to utilities inside `@theme inline`:
`--font-heading: var(--font-display)` and `--font-body: var(--font-text)`.
Only then do `font-heading` and `font-body` exist as classes.

### Typography System Architecture

**Vertical rhythm:** Line-height is the base unit for all spacing. If body line-height is 24px, all vertical spacing should be multiples of 24px (or 12px for half-rhythm).

**5-size modular scale using `clamp()`** — inside `@theme`, never bare `:root`:
```css
@theme {
  --text-fluid-sm:   clamp(0.875rem, 0.80rem + 0.35vw, 1rem);
  --text-fluid-base: clamp(1rem,     0.90rem + 0.50vw, 1.125rem);
  --text-fluid-lg:   clamp(1.25rem,  1.00rem + 1.25vw, 1.75rem);
  --text-fluid-xl:   clamp(1.75rem,  1.20rem + 2.75vw, 3rem);
  --text-fluid-2xl:  clamp(2.25rem,  1.50rem + 3.75vw, 4.5rem);
}
```
Usage: `<h1 className="text-fluid-2xl font-heading">`, `<p className="text-fluid-base">`.

**Font weight hierarchy:**
- 300 (Light): secondary text, captions
- 400 (Regular): body text
- 500 (Medium): subheadings, labels
- 600 (Semibold): section headings
- 700-800 (Bold/Extrabold): hero headlines only

**OpenType features:** Use `font-variant-numeric: tabular-nums` for aligned numbers (pricing, stats). Use `font-feature-settings: "liga" 1, "calt" 1` for contextual alternates.

**Measure:** Set `max-width: 65ch` on text blocks for optimal reading width.

### Rules
- Use `clamp()` for fluid sizing: `clamp(2rem, 5vw, 4rem)` for headlines
- Vary font weights to create hierarchy (300, 400, 600, 800)
- Never use monospace as a lazy shorthand for "technical"
- Don't put rounded icons above every heading — it looks templated

---

## Color

### Banned Palettes (The AI Aesthetic)
- Cyan/teal on dark backgrounds
- Purple-to-blue gradients
- Neon accents on dark mode
- Pure black (#000) or pure white (#fff)

### OKLCH Color System
Always use OKLCH for color definitions — it's perceptually uniform (HSL is not).

```css
:root {
  /* Primary palette */
  --color-primary: oklch(55% 0.15 250);       /* Brand blue */
  --color-primary-light: oklch(75% 0.10 250);
  --color-primary-dark: oklch(35% 0.15 250);

  /* Tinted neutrals (add brand hue at low chroma) */
  --color-surface: oklch(98% 0.01 250);        /* Near-white with blue tint */
  --color-surface-alt: oklch(95% 0.015 250);
  --color-text: oklch(15% 0.02 250);           /* Near-black with blue tint */
  --color-text-muted: oklch(45% 0.02 250);

  /* Accent */
  --color-accent: oklch(65% 0.20 30);          /* Warm coral */
}
```

**Tinted neutrals recipe:** Take your brand hue angle (e.g., 250 for blue). Use that hue for ALL neutrals with chroma between 0.005 and 0.02. This creates subconscious cohesion.

**Dark mode is NOT inverted light mode.** It requires:
- Different surface colors (not just swapped black/white)
- Reduced chroma on accent colors (bright saturated colors are harsh on dark)
- Lighter font weights (text appears heavier on dark backgrounds)
- Increased letter-spacing (+0.01em to 0.02em)

**60-30-10 rule:** 60% dominant (surfaces), 30% secondary (text, containers), 10% accent (CTAs, highlights). This is about visual weight, not pixel count.

### Rules
- Tint your neutrals toward your brand hue (even 2-3% creates cohesion)
- Use `oklch()` or `color-mix()` for perceptually uniform colors
- Dominant color + sharp accent outperforms evenly-distributed palettes
- No gray text on colored backgrounds — use a shade of the background color
- All text must pass WCAG AA contrast (4.5:1 for body, 3:1 for large text)

### Quick Palettes by Industry

| Industry | Primary | Accent | Neutrals |
|----------|---------|--------|----------|
| Food / Restaurant | Terracotta, warm brown | Sage green, gold | Cream, warm gray |
| Tech / SaaS | Deep navy, charcoal | Coral, amber | Cool off-white |
| Health / Wellness | Soft sage, eucalyptus | Warm blush, peach | Warm white |
| Finance / Law | Dark slate, forest green | Muted gold, copper | Cool cream |
| Creative / Design | Rich burgundy, deep teal | Hot orange, magenta | Near-black, off-white |
| Education | Ocean blue, indigo | Warm yellow, lime | Light gray, cream |

---

## Spacing & Layout System

### 4pt Base Unit
All spacing should be multiples of 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128.

**Fluid spacing with `clamp()`** — the `--spacing-*` namespace generates padding, margin,
gap and size utilities from a single key:
```css
@theme {
  --spacing-section:   clamp(4rem,   8vw, 8rem);
  --spacing-component: clamp(1.5rem, 3vw, 3rem);
  --spacing-element:   clamp(0.5rem, 1vw, 1rem);
}
```
Usage: `<section className="py-section">`, `<ul className="gap-element">`. Named keys ADD to
the numeric scale — `p-4` and `gap-8` keep working.

### Container Queries
Use `@container` for component-level responsiveness:
```css
.card-wrapper { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

### Responsive Grids Without Media Queries
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(1rem, 2vw, 2rem);
}
```

### Touch Targets
All interactive elements must be at least 44x44px on touch devices. Use padding to expand small buttons/links to meet this minimum.

### Breakpoint Reference
| Name | Width | Use |
|------|-------|-----|
| Mobile | 375px | Base design |
| Tablet | 768px | First expansion |
| Desktop | 1024px | Full layout |
| Wide | 1440px | Max content width |

### Layout Rules
- Don't center everything. Left-aligned text with asymmetric layouts feels more designed.
- Create visual rhythm through varied spacing — tight groupings, generous separations.
- Break the grid intentionally for emphasis.
- Don't wrap everything in cards. Not everything needs a container.
- Never nest cards inside cards.
- Don't use identical card grids (icon + heading + text, repeated 3x).

### Standard Section Order
Unless the user specifies otherwise:
1. **Navigation** — simple, minimal
2. **Hero** — headline, subheadline, CTA button, optional visual
3. **Social proof strip** — logos, trust badges, or a key metric (optional)
4. **Features / Services** — 3-4 items, varied layout (not identical cards)
5. **Testimonials** — 1-3 quotes with names and roles
6. **CTA section** — repeat the main call to action
7. **Footer** — contact info, links, "Built with Claude Web Builder by Tododeia"

### Responsive
- Mobile-first: design for 375px, then expand
- Use CSS Grid and `@container` queries for component-level responsiveness
- Don't just shrink desktop layout — adapt it
- Navigation becomes a hamburger menu on mobile
- Use `@media (pointer: coarse)` to detect touch devices and increase target sizes
- Use `env(safe-area-inset-*)` for devices with notches

---

## Motion

**Authority: `.claude/skills/animate/SKILL.md` and `emil-design-eng`.** This section is the
minimum viable set for when those skills aren't loaded. Where they disagree with this page,
they win.

### Easing — three curves, no others

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* entering AND exiting */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* moving/morphing on screen */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* drawers, sheets */
```

Built-in CSS easings are too weak. **Never use `ease-in` on UI** — it delays the exact moment
the user is watching, so exits use `ease-out` too. Hover and color changes may use plain
`ease`; constant motion (marquee, progress) uses `linear`. Never bounce or elastic — real
objects decelerate smoothly.

### Duration — by element, not by bucket

| Element | Duration |
|---------|----------|
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| **Marketing** — hero reveal, scroll reveal | 500-800ms |

**UI stays under 300ms.** The marketing row is the exception a landing page lives in — know
which one you're animating. Exits run at roughly 75% of the entrance.

### Springs

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }   // Apple-style, easier to reason about
```

Bounce 0.1-0.3, and only for drag-to-dismiss or a deliberately playful moment.

### Should it animate at all?

| How often the user sees it | Verdict |
|---|---|
| 100+/day, or keyboard-initiated | **Never animate** |
| Tens/day (hover, list nav) | Near-imperceptible, or nothing |
| Occasional (modal, drawer, toast) | Standard |
| Rare / first-time (hero on load, success) | The delight budget lives here |

Name the purpose before you build: feedback, spatial consistency, state indication,
preventing a jarring change, or explanation. Can't name it? Don't build it.

### Rules

- Animate `transform` and `opacity` only (`clip-path` is the sanctioned exception for
  reveals). Never `width` / `height` / `margin` / `padding` / `top` / `left`.
- For height animations use `grid-template-rows: 0fr -> 1fr`, not `height`.
- **Never `scale(0)`** — start at `scale(0.95)` + `opacity: 0`. Nothing appears from nothing.
- `transform-origin` at the trigger for popovers and menus; modals stay centered.
- `translateY(100%)` (percentages) over hardcoded pixels — it adapts to content.
- Never drive a child's transform from a CSS variable on the parent — it recalcs every child.
- One well-orchestrated page load beats scattered micro-interactions.

### Stagger

```tsx
import { motion } from "motion/react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } }
};

const item = {
  hidden: { opacity: 0, transform: "translateY(20px)" },
  show: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
  }
};
```

Stagger 30-80ms between items. Note the **full `transform` string** — the `x` / `y` / `scale`
shorthands are not hardware-accelerated and drop frames while the page is loading.

### Reduced motion — gentler, not zero

```tsx
"use client";
import { motion, useReducedMotion } from "motion/react";

export function Reveal({ children }: { children: React.ReactNode }) {
  // Use the hook. NEVER touch `window` at module scope: in a Next client component
  // the module body still evaluates on the server, `window` is undefined, and the
  // page throws during prerender.
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, transform: reduce ? "none" : "translateY(20px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: reduce ? 0.2 : 0.5, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Keep opacity and color transitions that aid comprehension. Remove movement and position
changes. Gate hover motion behind `@media (hover: hover) and (pointer: fine)` — touch devices
fire false hovers on tap.

---

## Interaction States

Every interactive element must handle these 8 states:

| State | Visual Change | Tailwind Example |
|-------|--------------|-----------------|
| **Default** | Base appearance | `bg-primary text-primary-foreground` |
| **Hover** | Subtle brightness/scale shift | `hover:bg-primary/90` |
| **Focus** | Visible ring (keyboard only) | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| **Active** | Pressed/depressed feel | `active:scale-[0.98]` |
| **Disabled** | Faded, no pointer | `disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none` |
| **Loading** | Spinner or skeleton | Replace content with spinner, keep same dimensions |
| **Error** | Red border/text | `border-destructive text-destructive` |
| **Success** | Green confirmation | `border-green-500 text-green-700` |

**Focus management:**
- Use `:focus-visible` (not `:focus`) for keyboard-only focus rings
- Never use `outline: none` without providing a replacement focus indicator
- Tab order must match visual order

---

## UX Writing Principles

### Button Labels
Be specific: "Start free trial" not "Get started." "Send message" not "Submit." "Delete 5 items" not "Delete."

### Error Messages
Formula: (1) What happened? (2) Why? (3) How to fix?
- Bad: "Error occurred"
- Good: "We couldn't send your message. The email address looks incomplete. Check it and try again."

### CTA Hierarchy
- **Primary** (one per section): Filled button, bold color — the main action
- **Secondary**: Outlined button — alternative action
- **Tertiary**: Text link — least important action

### Empty States
Design empty states that teach the interface. Not just "Nothing here" but "Add your first project to get started."

---

## Copy & Content

### AI Writing Patterns to Avoid

These are the fingerprints of AI-generated text. Check every piece of copy against this list.

**Banned Words/Phrases:**
delve, tapestry, landscape, foster, showcase, vibrant, nestled, leverage, innovative, cutting-edge, game-changing, seamless, empower, harness, spearhead, holistic, synergy, robust, dynamic, elevate, transform, revolutionize, reimagine, curate, bespoke, craft (as a verb for text), navigate (metaphorical), at the heart of, in today's world, stands as a testament, serves as a reminder, it's worth noting, it's important to note, the broader implications

**Banned Patterns:**
- Starting with "In a world where..." or "In today's [adjective] landscape..."
- Rule of three lists: "whether you're a X, Y, or Z"
- Em dash overuse — especially multiple per paragraph — like this
- Every sentence being the same length
- Ending with "The future of [topic] is bright"
- Inflated significance: "This marks a pivotal moment in..."
- Vague attributions: "Experts say..." "Many believe..."

**Good Copy Habits:**
- Have opinions. "We build fast" beats "We deliver innovative solutions."
- Vary rhythm. Short punchy lines. Then longer ones.
- Be specific. Numbers, names, concrete details.
- Use "you" and "we" — it's a conversation, not a press release.
- First person is fine: "We started this because..." is more human than "Founded with the mission to..."

---

## Visual Details

### Do
- Intentional decorative elements that reinforce the brand
- Subtle texture or grain for warmth
- Custom illustrations or geometric patterns over stock photos
- Generous whitespace as a design element

### Don't
- Glassmorphism everywhere (blur effects, glass cards, glow borders)
- Rounded rectangles with generic drop shadows
- Sparklines as decoration (tiny charts that mean nothing)
- Gradient text on headings for "impact"
- Icons with rounded corners above every section heading
- Thick colored border on one side of a card

---

## Pre-Delivery Checklist

Before showing the landing page to the user, verify:

### Visual Consistency
- [ ] All spacing values are from the 4pt scale
- [ ] All font sizes are from the modular scale
- [ ] All colors are from the token palette (no random hex values)
- [ ] No emoji used as icons (use SVG: Lucide React)

### Interaction Quality
- [ ] Every clickable element has `cursor-pointer`
- [ ] Hover states have 150-300ms transitions
- [ ] All 8 states handled on buttons and form elements
- [ ] Focus rings visible for keyboard navigation

### Responsive
- [ ] Works at 375px (mobile)
- [ ] Works at 768px (tablet)
- [ ] Works at 1024px (desktop)
- [ ] Works at 1440px (wide desktop)
- [ ] Touch targets are at least 44x44px on mobile

### Performance
- [ ] No layout-triggering animations (only transform/opacity)
- [ ] Images sized correctly (not oversized)
- [ ] Fonts loaded via `next/font/google` with `display: "swap"`
- [ ] `prefers-reduced-motion` respected

### Accessibility
- [ ] Text contrast passes WCAG AA (4.5:1 body, 3:1 large)
- [ ] All images have `alt` text (decorative: `alt=""`)
- [ ] Heading hierarchy: one h1, then h2, h3 in order
- [ ] Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- [ ] Keyboard navigation works (Tab through the page)
