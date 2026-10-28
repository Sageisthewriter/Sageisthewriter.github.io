# Sage portfolio — first preview

A static, dependency-free portfolio and seven full-text sample readers. All writing previews come exclusively from `Reference/Samples/`. The poster supplies the introduction, service list, boundaries, and social handles. Cover ornaments are original SVG line illustrations; UI icons are Bootstrap Icons.

Run `npm run dev` from the repository root for a local preview. The deployable website lives at the repository root; GitHub Pages serves `index.html` and relative assets directly. Hash-based reader URLs work without server rewrites.

See [README.md](README.md) for the single-repository GitHub Pages + Cloudflare Worker setup. The backend is in [contact-worker/](contact-worker/README.md). Set the public contact endpoint in root `config.js`. Turnstile is optional and off by default.

The endpoint contract is `POST` JSON:

```json
{
  "name": "Visitor name",
  "email": "visitor@example.com",
  "service": "Ghostwriting",
  "message": "Project inquiry",
  "website": "",
  "turnstileToken": "browser challenge token"
}
```

The Worker returns HTTP 200 with `{ "ok": true, "requestId": "…" }` only after confirmed Discord delivery; HTTP 429 with `Retry-After` indicates throttling. The client preserves input after errors and times out after 15 seconds. The Worker validates all fields, optionally verifies Turnstile, enforces rate limits, suppresses visitor-controlled mentions, keeps the webhook URL secret, and allows only the configured website origins. Client validation is only a usability aid.

## Content and review

- Readers contain complete supplied sample text, not the separate Complete Reads, Smut, or YouTube folders.
- A few genre-heading paragraphs are removed where the reader title replaces them. Separate blurbs remain labeled.
- Visually Latin Cyrillic lookalikes in the romance text are mapped to Latin for search and accessible reading. Narrative wording and known draft continuity issues are otherwise preserved.
- The romance reader includes a mature-language note. No new stories, testimonials, rates, or experience claims are invented.
- Reading position, font size, theme, and last-read sample are saved only in browser local storage. No visitor accounts or analytics are included.
- Google Fonts provides Cormorant Garamond, DM Sans, and Source Serif 4, with local fallback fonts. A network connection is needed for those fonts; reading and layout still work without them.
- Instagram is **depproduction**, corrected by the project owner; the other social handles come from the poster.

## Themes and motion

- The main page and reader share a persistent dark/light preference on the HTML root. Light mode changes the full background, prose, cards, form, and navigation instead of only the reader header.
- Both theme buttons reveal the next theme in an expanding circle from the button using the native View Transition API. Browsers without that API and visitors preferring reduced motion switch immediately. The browser's toolbar theme color is updated as well.
- Hero books are real buttons for **The Dragon’s Pact** and **A Thief’s Gambit**, both from the Samples folder. A rear book moves to the front when selected; clicking the selected book opens its hinged cover and then its reader. Keyboard activation follows the same interaction.
- As sample cards enter view, covers peel out from the hero stack and settle into their actual grid positions. Flights track their targets while scrolling and are cleared when opening a reader. Each card animates once per page load.
- Section entrances, subtle star animation, and button feedback complete the motion. System reduced-motion preferences disable the animated effects without changing navigation.
- Interaction code is in `motion.js`; theme and animation styles are in `motion.css`.

## Mobile layout

`mobile.css` is loaded last and owns the mobile sizing rules. Hero books use real responsive widths/heights and reserved space, rather than scaling the desktop stage with a transform that can be overwritten by entrance animation. Phones use compact cover-and-summary rows, a single-column contact form with 16px input text, shorter navigation labels, and a reader toolbar without the centered logo competing for space. Touch controls are at least 44px high.

On mobile, sample covers settle into place inside their rows instead of flying across the viewport. Book selection/opening motions are shorter, and reader entrances omit blur. Desktop layouts and cover flights are retained. Browser/device testing is left to the project owner.

Check JavaScript syntax with `npm run check`. Browser and functional testing are left to the project owner as requested.

To refresh the readers after editing the source DOCX files, run `python3 scripts/export-samples.py` from the repository root. The existing sample JSON supplies the title/genre/card metadata, and the exporter replaces its prose from the seven allowlisted source files. The ignored `Reference/` directory must be present locally for this operation; it is not needed to serve the built preview.
