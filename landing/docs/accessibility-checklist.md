# Accessibility Checklist

WCAG AA compliance requirements for every landing page. Reference this during Phase 4 (Build) and Phase 5 (QA).

---

## Semantic HTML Structure

### Landmarks
Use HTML landmarks so screen readers can navigate the page:
```tsx
<header>    {/* Site header with nav */}
  <nav>     {/* Main navigation */}
</header>
<main>      {/* Primary content — one per page */}
  <section> {/* Each major content area */}
</main>
<footer>    {/* Site footer */}
```

### Heading Hierarchy
- One `<h1>` per page (the hero headline)
- Headings in order: h1 → h2 → h3 — never skip levels
- Each section starts with an `<h2>`
- Sub-sections within use `<h3>`

**Bad:** h1 → h3 (skipped h2)
**Good:** h1 → h2 → h3 → h2 → h3

### Lists
Use `<ul>` or `<ol>` for groups of related items (features, nav items, social links). Don't use `<div>` for everything.

---

## Keyboard Navigation

### Tab Order
- All interactive elements (links, buttons, inputs) must be reachable via Tab
- Tab order must match visual order (left-to-right, top-to-bottom)
- Test: press Tab repeatedly and verify it follows the visual flow

### Skip Link
Add a skip-to-content link as the first focusable element:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-background focus:px-4 focus:py-2 focus:rounded">
  Skip to content
</a>
// ...
<main id="main-content">
```

### Escape Key
- Closes modals, dropdowns, and mobile menus
- shadcn `Dialog` and `Sheet` components handle this automatically

---

## Focus Management

### Focus-Visible (Keyboard-Only Focus)
Use `:focus-visible` — shows focus ring only for keyboard users, not mouse clicks:
```tsx
<button className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none">
  Click me
</button>
```

**Never** remove focus indicators entirely with `outline: none` without providing a replacement.

### Focus Trapping
When a modal or mobile menu is open, Tab should stay within that element.
- shadcn `Dialog` and `Sheet` components handle this automatically
- Use the `inert` HTML attribute on background content when a modal is open

---

## Color & Contrast

### Minimum Contrast Ratios (WCAG AA)
| Element | Ratio | Example |
|---------|-------|---------|
| Body text (under 18px) | 4.5:1 | Dark gray on white |
| Large text (18px+ bold, 24px+ regular) | 3:1 | Medium gray on white |
| UI components (icons, borders, inputs) | 3:1 | Border on background |

### Rules
- Never use color alone to convey information (e.g., red for error must also include text/icon)
- Test contrast with Chrome DevTools: Inspect element → check contrast ratio
- Tinted neutrals from the design guide still need to pass these ratios

### Testing
```
Chrome DevTools → Elements panel → Select text → Check "Contrast" section
Or: Chrome DevTools → Rendering → CSS Overview → Contrast issues
```

---

## Images & Media

### Informative Images
Images that convey meaning need descriptive `alt` text:
```tsx
<Image alt="Team of four designers working at a shared desk" ... />
```

### Decorative Images
Images that are purely visual (backgrounds, patterns) use empty alt:
```tsx
<Image alt="" ... />  // Screen readers skip this
```

### Icon-Only Buttons
Buttons with only an icon need an accessible label:
```tsx
<button aria-label="Open menu">
  <MenuIcon aria-hidden="true" />
</button>
```

### SVG Icons
When icons appear next to text, hide them from screen readers:
```tsx
<button>
  <MailIcon aria-hidden="true" className="mr-2" />
  Send message
</button>
```

---

## Forms (Contact Forms)

### Labels
Every input must have a visible label. Don't use placeholder as the only label:
```tsx
<label htmlFor="email" className="text-sm font-medium">Email</label>
<input id="email" type="email" placeholder="you@example.com" />
```

### Error Messages
Connect errors to their input with `aria-describedby`:
```tsx
<input id="email" aria-describedby="email-error" aria-invalid="true" />
<p id="email-error" className="text-sm text-destructive">Please enter a valid email</p>
```

### Form Submission Feedback
Use `aria-live="polite"` for success/error messages after submission:
```tsx
<div aria-live="polite" role="status">
  {submitted && <p>Message sent! We'll be in touch.</p>}
</div>
```

---

## The 8 Interactive States

Every button, link, and form element should handle these states. See `docs/design-guide.md` for the full Tailwind patterns.

1. **Default** — base appearance
2. **Hover** — subtle change (brightness, underline)
3. **Focus** — visible ring (keyboard only, via `focus-visible`)
4. **Active** — pressed feel (scale down slightly)
5. **Disabled** — faded, no interaction
6. **Loading** — spinner replacing content, same dimensions
7. **Error** — red border/text
8. **Success** — green confirmation

---

## Motion & Vestibular Sensitivity

~35% of adults 40+ have some degree of vestibular disorder. Respect their preferences:

```tsx
// Check at component level
const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

// Or in CSS
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Testing Approach

### Quick Tests (do for every page)
1. **Keyboard test:** Tab through the entire page. Can you reach everything? Does focus order make sense?
2. **Zoom test:** Browser zoom to 200%. Does content reflow? Is anything cut off?
3. **Heading test:** Check that h1 → h2 → h3 hierarchy is correct (no skipped levels)

### Thorough Tests (do before deployment)
4. **Screen reader:** macOS VoiceOver (Cmd+F5). Read through the page. Does it make sense?
5. **Contrast:** Chrome DevTools → CSS Overview → check for contrast issues
6. **Reduced motion:** Enable "Reduce motion" in macOS System Settings → Accessibility → Display. Verify animations are disabled.
7. **axe DevTools:** Install the free browser extension. Run a scan. Fix any issues.
