# Landing Page Patterns

8 proven landing page archetypes. Choose based on the user's business type and goals, or let them pick.

---

## 1. Hero-Centric

**Best for:** Portfolios, creative agencies, product launches, personal brands.

**What it feels like:** Bold first impression. The hero IS the page — everything else supports it.

**Section order:**
1. Minimal nav (logo + 2-3 links)
2. Full-viewport hero (large headline, subheadline, single CTA)
3. Brief about strip (one sentence or stat)
4. Work/product grid (3-6 items)
5. Single testimonial (large format)
6. Contact / CTA
7. Footer

**CTA strategy:** One primary CTA in hero. Repeat at bottom.

**shadcn components:** `button`, `navigation-menu`, `card` (for work grid)

---

## 2. Conversion-Optimized

**Best for:** SaaS, apps, subscription services, lead generation.

**What it feels like:** Every section pushes toward one action. Clear value proposition, objection handling built in.

**Section order:**
1. Nav with CTA button
2. Hero (problem statement + solution + CTA)
3. Social proof strip (client logos or "Trusted by X+ companies")
4. Pain point / solution section (before/after or problem/solution format)
5. Features (benefit-focused, not feature-focused)
6. Testimonials (2-3 with names, roles, photos)
7. Pricing or plan comparison (optional)
8. FAQ (handles objections)
9. Final CTA section (strong, urgent)
10. Footer

**CTA strategy:** CTA in nav, hero, after testimonials, and final section. Same action everywhere.

**shadcn components:** `button`, `card`, `badge`, `accordion` (FAQ), `separator`, `toggle` (pricing)

---

## 3. Feature-Rich

**Best for:** Tech products, multi-service agencies, platforms with many capabilities.

**What it feels like:** Comprehensive showcase. Each feature gets space to breathe.

**Section order:**
1. Nav with feature links
2. Hero (overview headline + product visual/mockup)
3. Feature overview strip (3-4 key benefits, icons)
4. Detailed features (alternating text-left/image-right layout, 3-4 sections)
5. Integration/partner logos
6. Testimonials
7. CTA section
8. Footer

**CTA strategy:** Primary CTA in hero. Secondary CTAs after each feature detail ("Learn more", "Try it").

**shadcn components:** `button`, `card`, `badge`, `navigation-menu`, `separator`, `tabs` (feature categories)

---

## 4. Minimal

**Best for:** Luxury brands, personal brands, artists, high-end services.

**What it feels like:** Maximum whitespace. Strong typography does the heavy lifting. Every element is intentional.

**Section order:**
1. Minimal nav (logo + 1-2 links, text-only)
2. Hero (text-dominant — large serif headline, one line of body, subtle CTA)
3. Single statement or feature (one paragraph, large type)
4. Visual moment (one image or decorative element)
5. CTA (understated — text link or outlined button)
6. Footer (minimal — just essentials)

**CTA strategy:** Understated. One CTA in hero, one at bottom. No urgency — confidence.

**shadcn components:** `button`, `separator` — minimal component usage, rely on custom typography

---

## 5. Social-Proof-Heavy

**Best for:** Consultants, coaches, service businesses, B2B.

**What it feels like:** Trust-first. "Others like you chose us" approach.

**Section order:**
1. Nav
2. Hero (headline focused on outcome, not product)
3. Client logos strip
4. Testimonials carousel or grid (3-6 testimonials)
5. Case study highlight (one detailed success story)
6. Services overview
7. CTA section
8. Footer

**CTA strategy:** CTA after testimonials (highest trust point). Repeat after services.

**shadcn components:** `button`, `card`, `avatar`, `carousel`, `badge`

---

## 6. Interactive Demo

**Best for:** SaaS products, developer tools, design tools, anything you can show in action.

**What it feels like:** "See it working" instead of "read about it."

**Section order:**
1. Nav with "Try it" CTA
2. Hero with embedded demo, video, or interactive preview
3. "How it works" (3 steps with icons/numbers)
4. Features (tied to what they just saw in the demo)
5. Testimonials
6. CTA section (start free trial)
7. Footer

**CTA strategy:** "Try it" in nav and hero. "Start free trial" after features and at bottom.

**shadcn components:** `button`, `card`, `badge`, `tabs` (demo modes), `dialog` (expanded demo)

---

## 7. Trust & Authority

**Best for:** Law firms, financial services, healthcare, government, insurance.

**What it feels like:** Credible, established, safe. Design conveys reliability.

**Section order:**
1. Nav (logo + clear service categories)
2. Hero (confident headline, professional photo or abstract)
3. Credentials strip (awards, certifications, "X years experience", licenses)
4. Services (detailed, organized by category)
5. Team highlights (key people with photos and credentials)
6. Testimonials (formal — include full names and companies)
7. Contact form (full form, not just CTA button)
8. Footer (detailed — address, phone, hours, legal links)

**CTA strategy:** "Schedule a consultation" — formal language. In hero and after services.

**shadcn components:** `button`, `card`, `avatar`, `input`, `textarea`, `label`, `separator`

---

## 8. Storytelling

**Best for:** Nonprofits, mission-driven brands, artisan businesses, food/beverage.

**What it feels like:** Narrative-driven. You scroll through a story. Emotional connection.

**Section order:**
1. Minimal nav
2. Hero with origin teaser ("It started with...")
3. Origin story section (2-3 paragraphs with visual)
4. What we do / what we make (products or services)
5. Impact section (numbers, before/after, or community photos)
6. Single powerful testimonial
7. CTA ("Join us", "Support us", "Try it")
8. Footer

**CTA strategy:** Emotional CTA after the story lands. "Be part of the story."

**shadcn components:** `button`, `card`, `separator`, `badge`

---

## CTA Strategy Guide

### Placement Rules
- **Above the fold:** Always one CTA visible without scrolling
- **After social proof:** Highest conversion point — place CTA right after testimonials
- **End of page:** Final CTA before footer (last chance)
- **Never more than 2 scrolls apart** — user should always see a CTA nearby

### CTA Copy Guidelines
- Be specific: "Start your free trial" not "Get started"
- Include the benefit: "See your page live" not "Deploy"
- Match the user's language: if they said "book a call", the CTA says "Book a Call"
- For Spanish pages: "Empieza gratis", "Agenda una llamada", "Conoce mas"

### Visual Hierarchy
- **Primary CTA** (one per section): Filled button, brand color, largest
- **Secondary CTA**: Outlined button or ghost button
- **Tertiary**: Text link with arrow — "Learn more →"

---

## Component-to-Pattern Mapping

| Component Need | shadcn Component | Install Command |
|---------------|-----------------|-----------------|
| Primary button | `button` | `npx shadcn@latest add button` |
| Feature card | `card` | `npx shadcn@latest add card` |
| Testimonial avatar | `avatar` | `npx shadcn@latest add avatar` |
| Testimonial slider | `carousel` | `npx shadcn@latest add carousel` |
| Mobile menu | `sheet` | `npx shadcn@latest add sheet` |
| FAQ accordion | `accordion` | `npx shadcn@latest add accordion` |
| Pricing toggle | `toggle` | `npx shadcn@latest add toggle` |
| Contact form fields | `input`, `textarea`, `label` | `npx shadcn@latest add input textarea label` |
| Tab navigation | `tabs` | `npx shadcn@latest add tabs` |
| Modal/dialog | `dialog` | `npx shadcn@latest add dialog` |
