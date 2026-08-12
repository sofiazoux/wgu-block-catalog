# Block catalog — interactive spec prototype

A hosted, interactive catalog of the content blocks proposed for the WGU
program. It replaces a static walkthrough for anything involving behaviour:
each block renders **live** and can be interrogated — change the content, force
edge cases, inspect the grid, and resize the frame.

Two audiences, equal weight:

- **WGU** — see what students will read, and judge whether it serves learning.
- **OpenCraft developers** — the rules, the edge cases, and the markup, in a
  persistent side panel next to the rendered block.

> This is **not** a mockup of an authoring tool, and **not** production code.
> It shows the *rendered design* and the *rules it obeys*; OpenCraft decides how
> authors produce it. The whole UI names **states of the content**, never
> actions an author takes.

## Run it

Plain HTML/CSS/JS. No build step, no framework, no package manager, no CDN.

- **Offline:** open `index.html` directly in any current browser
  (Chrome, Firefox, Safari, Edge). Everything — fonts included — is local.
- **Hosted:** served as static files (e.g. GitHub Pages).

## Layout of the source

```
block-catalog/
├── index.html                     # shell: loads styles + the three scripts, in order
├── robots.txt                     # Disallow: / (paired with a noindex meta)
├── assets/
│   ├── app.js                     # chrome: routing, catalog, detail view, inspectors
│   ├── catalog.css                # the neutral prototype chrome (Storybook-like)
│   ├── tokens.css                 # course design tokens, scoped to .wgu-block
│   └── fonts/                     # self-hosted Sora + Lato (woff2) + @font-face
└── blocks/
    ├── flexible-content.css       # ★ THE REFERENCE IMPLEMENTATION of the layout rules
    ├── flexible-content.js        # content model, ROW DERIVATION (§6.6), renderer, presets
    └── spec-data.js               # rules + decision log + markup for the spec panel
```

### For OpenCraft

`blocks/flexible-content.css` **is** the reference implementation — the CSS
here is what you build as a raw HTML/CSS block in OpenedX, not a translation of
it. It is commented as documentation; read it top to bottom. It reuses the
existing `.wgu-block` token layer (`assets/tokens.css`), so it drops into the
same design system as the shipped course blocks.

Row structure is **derived, never authored**: see `deriveRows()` in
`flexible-content.js`. Change the content array and re-run — the rows fall out.

## Status

The catalog uses four statuses — `Proposed`, `In review`, `Approved`,
`Shipped` — shown as badges so the presentation reads as "what does this need to
move forward?" rather than "is this right?". The Flexible Content Block is
**In review**; the Interactive Block is **Proposed** (deferred, scaffolded).

Everything here is a **proposal pending feedback**. The authoring model shown is
intent, not commitment — parts depend on open questions with OpenCraft that are
not yet answered.

## Fonts

Sora and Lato are vendored locally as latin-subset `woff2` (the OFL builds).
The production OpenedX blocks load the same faces via Google Fonts; here they
are self-hosted so the specimen renders on-brand with zero network access.
