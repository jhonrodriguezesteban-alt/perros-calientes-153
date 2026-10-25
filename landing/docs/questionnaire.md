# Questionnaire Flow

Ask questions conversationally in rounds. Don't read this file out loud — use it as your guide. Adapt the phrasing to feel natural. After each round, summarize what you've heard back to the user before moving on.

---

## Round 1: The Basics (always ask)

1. **What's your business or project called?**
   - Required. No default.

2. **In one sentence, what do you do?**
   - Default: Infer from the name and context.

3. **Who are you trying to reach?**
   - Default: "General audience"
   - Follow up if vague: "Are these mostly young professionals, families, business owners...?"

After Round 1, summarize: "Got it — [business] helps [audience] with [service]. Let me ask about the look and feel."

---

## Round 2: Visual Direction

4. **Do you have any websites you like the look of?**
   - If yes: Use `web-reader` skill to analyze them. Note colors, layout, typography, vibe.
   - Default: Skip, choose based on industry.

5. **Any color preferences, or should I pick based on your industry?**
   - Default: Use `ui-ux-pro-max` to recommend. Run: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<industry>" --domain color`
   - If search fails: Choose based on industry norms from `docs/design-guide.md`.

6. **Light or dark theme?**
   - Default: Light.

7. **What vibe should visitors get?**
   - Offer options: professional, playful, bold, elegant, minimal, warm, modern, edgy, luxurious.
   - Default: "Professional and approachable."

After Round 2, **PAUSE and present the design direction**: "Here's what I'm thinking — [color palette with specific hex codes], [font pairing with names], [general layout approach]. Sound good?"

**Wait for user approval before continuing to Round 3.** If the user wants changes, adjust and re-present until approved. This ensures the content questions in Round 3 are informed by the approved design direction.

---

## Round 3: Content

8. **What's the one thing you want visitors to do?**
   - Examples: sign up, book a call, buy something, learn more, get a quote.
   - Default: "Learn more / get in touch."

9. **What are 3-4 key things to highlight?**
   - These become the features/services section.
   - Default: Generate from business description + industry norms.

10. **Do you want a contact form on the page?**
    - If yes: What fields? (Name, email, message is standard. Phone? Company?)
    - Options:
      - **Simple (default):** A "mailto:" link styled as a contact section — no backend needed.
      - **Form with Formspree:** Free service, no backend needed. Tell the user: "Go to formspree.io, create a free account, create a form, and give me the form ID (it looks like 'xpznqkdl')." If user doesn't want to do this now, use mailto: as default and leave a TODO comment.
    - If user just wants an email link or phone number, that works too.

11. **Got a tagline or slogan?**
    - Default: Write one. Run through humanizer.

12. **Any testimonials, reviews, or social proof?**
    - Default: Create a placeholder testimonials section. Use realistic but clearly placeholder names.

13. **Any social media links to include?**
    - Instagram, X/Twitter, Facebook, LinkedIn, TikTok, YouTube, etc.
    - Default: Placeholder social icons in footer — user fills in the URLs later.

After Round 3, recap: "I have everything I need for content. A couple more technical questions."

---

## Round 4: Technical (keep brief)

14. **Do you have a logo?**
    - Accept: file path, URL, or "no"
    - Default: Text-only logo using the business name with the headline font.

15. **Any specific images to use?**
    - Accept: file paths, URLs, or "no"
    - Supported formats: JPG (photos), PNG (logos with transparency), SVG (icons/logos), WebP (modern compression)
    - If the user provides URLs, download them: `curl -o site/public/images/photo.jpg "URL"`
    - Default: No stock photos. Use geometric patterns, gradients, or abstract decorative elements that match the design system.

16. **Do you have a favicon (the small icon in browser tabs)?**
    - Accept: file path, URL, or "no"
    - Default: Generate a simple favicon from the brand colors using `site/src/app/icon.tsx`.

17. **What language should the page be in?**
    - Default: Same language the user has been speaking in.
    - Note: All page content (headlines, body text, CTAs, meta tags) will be in the chosen language.

18. **Want me to deploy it to a live URL when we're done?**
    - Explain: "I can deploy it to Vercel — you'll get a link you can share with anyone."
    - Default: Yes.

---

## Handling "I don't know" / "You decide"

When the user defers any decision:
- **Colors**: Run ui-ux-pro-max color search for their industry + vibe.
- **Fonts**: Run ui-ux-pro-max typography search for their vibe keyword.
- **Copy**: Generate based on their answers, run through humanizer.
- **Layout**: Use proven section order: Hero > Features > Social Proof > CTA > Footer.
- **Style**: Match to their industry: law firm = refined/serif, tech startup = clean/modern, restaurant = warm/organic, creative agency = bold/experimental.
- **Contact form**: Use a mailto: link styled as a contact section.
- **Social media**: Add placeholder icons in footer.

Always tell the user what you chose and why, briefly: "I went with a warm palette — terracotta and off-white — because it fits the artisan food space well."

---

## After All Rounds

Summarize the full brief back to the user:
- Business name and description
- Target audience
- Design direction (colors, fonts, vibe)
- Main CTA
- Contact method (form, mailto, phone)
- Key sections/features
- Social media links
- Assets (logo, images, favicon, or defaults)
- Page language
- Deploy: yes/no

Ask: "Does this capture everything? I'll start building once you give me the green light."

Then proceed to Phase 2 (Design System) in the CLAUDE.md workflow.
