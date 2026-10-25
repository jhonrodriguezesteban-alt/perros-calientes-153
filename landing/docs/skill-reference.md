# Skill Reference

## How Skills Work
Skills are markdown files that Claude Code reads automatically. This project bundles **13 skills** in `.claude/skills/` — they all load automatically when Claude opens the project.

---

## Bundled Skills (included in this project, load automatically)

| Skill | Location | What It Does |
|-------|----------|-------------|
| `frontend-design` | `.claude/skills/frontend-design/` | Design methodology, anti-AI-slop rules, typography/color/layout/motion guidelines. Includes 7 reference docs. |
| `shadcn-ui` | `.claude/skills/shadcn-ui/` | React component library with Tailwind CSS. Copy-paste accessible components. |
| `humanizer` | `.claude/skills/humanizer/` | Removes AI writing patterns from text. 24+ pattern detection. |
| `vercel-react-best-practices` | `.claude/skills/vercel-react-best-practices/` | 62 performance rules across 8 categories for React/Next.js. Includes full AGENTS.md + 64 rule files. |
| `vercel-deploy` | `.claude/skills/vercel-deploy/` | **Deploy to Vercel sandbox** — no account or CLI needed. Includes `deploy.sh` script that auto-detects framework, packages, and deploys. MIT licensed by Vercel. |
| `building-components` | `.claude/skills/building-components/` | Guide for building modern, accessible, composable UI components. Includes 15 reference docs covering accessibility, composition, polymorphism, design tokens, and more. |
| `web-design-guidelines` | `.claude/skills/web-design-guidelines/` | Review UI code against Vercel's Web Interface Guidelines. Fetches latest rules and audits compliance. |
| `playwright-cli` | `.claude/skills/playwright-cli/` | Browser automation for screenshots and visual QA. Includes 7 reference docs. |
| `chrome-bridge-automation` | `.claude/skills/chrome-bridge-automation/` | Fallback visual QA — connects to user's Chrome via Midscene extension. Vision-driven screenshots. |
| `seo-audit` | `.claude/skills/seo-audit/` | Technical SEO analysis, meta tags, heading structure. |
| `ui-ux-pro-max` | `.claude/skills/ui-ux-pro-max/` | Design intelligence database — 161 color palettes, 57 font pairings, 50+ styles. Python CLI for search. |
| `web-reader` | `.claude/skills/web-reader/` | Extract content from reference URLs the user provides. |
| `deep-research` | `.claude/skills/deep-research/` | Systematic web research for industry-specific copy and content. |

All 13 skills are bundled — no installation needed.

---

## Invocation Examples

### vercel-deploy (bundled) — DEPLOY WITHOUT ACCOUNT
The primary deployment method. No Vercel account, CLI, or login needed.

```bash
# Deploy the site directory
bash .claude/skills/vercel-deploy/scripts/deploy.sh site
```

The script:
1. Auto-detects the framework from `package.json` (Next.js, Gatsby, Remix, Astro, etc.)
2. Creates a tarball (excludes node_modules, .git, .next, .env)
3. Uploads to Vercel's deploy endpoint
4. Polls until build completes (up to 5 minutes)
5. Returns JSON with `previewUrl` and `claimUrl`

**Output:** Share `previewUrl` with user. Mention `claimUrl` as optional for permanent hosting.

**Always run `npm run build` first** to catch errors before deploying.

If the Vercel CLI is installed and authenticated, you can also use: `cd site && npx vercel --yes`

### building-components (bundled)
Automatically loaded. Provides guidance when building UI components during Phase 4:
- Component taxonomy (primitives, components, blocks, templates)
- Accessibility patterns (ARIA, keyboard navigation, focus management)
- Composition patterns (slots, render props, controlled/uncontrolled state)
- Design token systems and theming
- Data attributes for styling and state

### web-design-guidelines (bundled)
Use during Phase 5 (QA) to review the built page against Vercel's Web Interface Guidelines.
Fetches the latest guidelines from GitHub and checks UI code for compliance.

### humanizer (bundled)
The humanizer skill loads automatically. To use it:
- After writing any copy (headlines, body text, CTAs, taglines), review it against the humanizer's pattern list
- The skill detects 24+ AI writing patterns including: inflated significance, promotional language, vague attributions, em dash overuse, rule of three, AI vocabulary words
- Check all text for banned words: delve, tapestry, landscape, foster, showcase, vibrant, nestled, leverage, innovative, cutting-edge, game-changing, seamless, empower, harness
- Rewrite any flagged text to sound human: vary sentence length, be specific, have opinions, use "you" and "we"

### seo-audit (bundled)
Run after the page is built, during Phase 5 (Preview & QA), before deployment.
The skill checks:
- Title tags (50-60 chars, keyword near start)
- Meta descriptions (150-160 chars, unique, includes CTA)
- Heading hierarchy (one H1, proper H2/H3 order)
- Image alt text (descriptive, not just filename)
- Core Web Vitals indicators
- Mobile readiness
- Structured data opportunities (JSON-LD for rich snippets)

### ui-ux-pro-max (bundled)

**Available `--domain` values:**

| Domain | What It Returns | Example Query |
|--------|----------------|---------------|
| `product` | Product type recommendations (SaaS, e-commerce, portfolio, etc.) | `"saas dashboard"` |
| `style` | UI styles (glassmorphism, minimalism, brutalism, etc.) + CSS keywords | `"luxury minimal"` |
| `typography` | Font pairings with Google Fonts imports | `"elegant serif"` |
| `color` | Color palettes by product type and mood | `"restaurant warm"` |
| `landing` | Landing page structure and CTA strategies | `"saas"` |
| `chart` | Chart types and library recommendations | `"financial dashboard"` |
| `ux` | Best practices and anti-patterns | `"form design"` |
| `icons` | Icon set recommendations by style and product type | `"outline minimal"` |
| `web` | App/web interface patterns and severity-rated guidelines | `"navigation"` |
| `react` | React performance guidelines | `"rerender"` |
| `google-fonts` | Full Google Fonts index (1,900+ families) with axes, subsets, popularity | `"variable display"` |

**Available `--stack` values:** `html-tailwind`, `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

For this project, `--stack nextjs` and `--stack shadcn` are the relevant ones. Verify both resolve before relying on them in Phase 2:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility" --stack shadcn
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "images" --stack nextjs
```

```bash
# Color palette for a restaurant
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "restaurant warm" --domain color

# Font pairing for elegant vibe
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant serif" --domain typography

# Landing page structure for SaaS
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "saas" --domain landing

# UI style recommendations for luxury brand
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "luxury brand" --domain style

# Stack-specific recommendations for Next.js + shadcn
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "modern clean" --stack shadcn
```

### playwright-cli (bundled)
```bash
# Open browser and navigate
playwright-cli open http://localhost:3000

# Take desktop screenshot
playwright-cli screenshot --filename=preview-desktop.png

# Resize to mobile and screenshot
playwright-cli resize 375 812
playwright-cli screenshot --filename=preview-mobile.png

# Resize to tablet
playwright-cli resize 768 1024
playwright-cli screenshot --filename=preview-tablet.png

# Close browser
playwright-cli close
```

### web-reader (bundled)
Use when the user provides reference URLs they like the look of.
```
Invoke by telling Claude to use the web-reader skill to analyze a URL.
Example: "Use web-reader to analyze https://example.com and note its
colors, layout approach, typography, and overall design direction."
```
The skill extracts page content, metadata, and structure — useful for understanding what the user likes about a reference site.

### deep-research (bundled)
Use when you need industry-specific knowledge for writing better copy or making design decisions.
```
Invoke by telling Claude to use deep-research for a specific topic.
Example: "Use deep-research to learn about the artisan bakery market —
what messaging resonates, what competitors look like, what customers care about."
```
Returns systematic findings from multiple sources — better than a single web search.
