# Performance Checklist

Targets and optimization techniques for fast landing pages. Reference this during Phase 4 (Build) and Phase 5 (QA).

---

## Core Web Vitals Targets

| Metric | Target | What It Measures |
|--------|--------|-----------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | How fast the main content loads |
| **INP** (Interaction to Next Paint) | < 200ms | How fast the page responds to clicks |
| **CLS** (Cumulative Layout Shift) | < 0.1 | How much the page jumps around while loading |

### How to Optimize LCP
- Use `priority` prop on hero image (the LCP element): `<Image priority />`
- Load fonts with `next/font/google` and `display: "swap"` (no render-blocking)
- Avoid large JavaScript bundles above the fold
- Use server components (no client-side rendering delay)

### How to Optimize INP
- Keep event handlers fast — no heavy computation on click
- Use `React.startTransition()` for non-urgent state updates
- Avoid blocking the main thread during hydration

### How to Optimize CLS
- Always set `width` and `height` on `<Image>` components
- Use `next/font` (prevents font swap layout shift)
- Don't inject content above existing content after page load
- Reserve space for dynamic content with CSS `min-height`

---

## Font Loading

```tsx
import { Space_Grotesk, DM_Sans } from "next/font/google";

const heading = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",        // Prevents FOIT (flash of invisible text)
  weight: ["400", "600", "700"],
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
```

**Tips:**
- Only load the weights you actually use (not all weights)
- Prefer variable fonts when available (one file, all weights)
- `display: "swap"` shows fallback font immediately, swaps when loaded

---

## Image Optimization

```tsx
import Image from "next/image";

// Hero image (above the fold — prioritize loading)
<Image
  src="/images/hero.jpg"
  alt="Description of the image"
  width={1200}
  height={630}
  priority               // Preloads this image
  className="object-cover"
/>

// Below-the-fold image (lazy loaded by default)
<Image
  src="/images/feature.jpg"
  alt="Description"
  width={600}
  height={400}
/>
```

**Tips:**
- Next.js automatically serves WebP/AVIF when the browser supports it
- Always provide `width` and `height` to prevent CLS
- Use `sizes` prop for responsive images: `sizes="(max-width: 768px) 100vw, 50vw"`
- Place images in `site/public/images/`

---

## Bundle Optimization

### Motion (reduce ~40% bundle)
```tsx
// Instead of importing everything:
import { LazyMotion, domAnimation, m } from "motion/react";

// Wrap your app:
<LazyMotion features={domAnimation}>
  <m.div animate={{ opacity: 1 }} />
</LazyMotion>
```

### Dynamic Imports for Below-the-Fold Sections
```tsx
import dynamic from "next/dynamic";

const Testimonials = dynamic(() => import("@/components/testimonials"), {
  loading: () => <div className="h-96" />, // Skeleton placeholder
});
```

### General Rules
- Import components directly, not through barrel files (index.ts re-exports)
- Only `"use client"` on components that need it (useState, useEffect, event handlers, Motion)
- Keep the page.tsx as a Server Component — import client components into it
- Load analytics/tracking scripts after hydration with `next/script` strategy `afterInteractive`

---

## CSS Performance

- Tailwind CSS automatically purges unused styles in production
- Avoid `@apply` in global CSS for Tailwind classes (can defeat purging)
- Use `content-visibility: auto` on long sections to skip rendering off-screen content:
  ```css
  .section-below-fold {
    content-visibility: auto;
    contain-intrinsic-size: 0 500px; /* Estimated height */
  }
  ```

---

## Build Verification

Run before deployment:
```bash
cd site && npm run build
```

Check the output for:
- **Page sizes:** Each page should be under 100KB of JavaScript
- **Build errors:** Fix any TypeScript or import errors
- **Warnings:** Address image optimization and font warnings
- **Static generation:** Landing pages should be statically generated (no dynamic server rendering needed)
