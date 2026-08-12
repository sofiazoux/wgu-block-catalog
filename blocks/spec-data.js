/* ============================================================================
 * spec-data.js — developer-facing content for the spec panel (§5.2, §10).
 *
 *   RULES     : the layout rules, each with a predicate that says whether the
 *               CURRENT configuration triggers it, so the panel can highlight
 *               the rules actually in play (§5.2).
 *   DECISIONS : the decision log (§10) — reasoning that must survive the meeting.
 *   buildMarkup(): the BEM markup for the current rows (§6.8).
 * ==========================================================================*/

/* Each rule: { id (spec section), title, body, triggers: [trigger-keys] }.
 * A rule is "active" when the configuration's trigger set intersects its keys.
 * `always: true` rules are shown active whenever the block renders at all. */
const RULES = [
  {
    id: "§6.6", title: "Rows are derived, never authored",
    body: "A flat content array plus anchors is run through a derivation function to produce rows. Change the content and the rows fall out — nothing is hardcoded.",
    always: true,
  },
  {
    id: "§6.1", title: "Wide reading measure",
    body: "The body text column targets 51ch ≈ 68 real characters — a comfortable reading measure. (ch is calibrated to real characters: Lato's “0” is ~1.35× the average glyph, so nominal ch overstates line length.)",
    always: true,
  },
  {
    id: "§6.1", title: "Narrow measure holds its floor",
    body: "Beside a side element the narrow measure must never drop below the 35ch floor (≈47 real characters) — the governing constraint of the block. The narrow measure is a consequence of image width, not authored.",
    triggers: ["aside"],
  },
  {
    id: "§6.1", title: "Narrow measure sits on the floor",
    body: "The largest image size drives the narrow measure to exactly 35ch. This is the closed-set image size doing its job: an author cannot push below the floor.",
    triggers: ["measure-floor"],
  },
  {
    id: "§6.2", title: "Text wraps around the side element (float)",
    body: "Implemented with float inside a flow-root row, not grid columns. The element bleeds past the text column into the margin area with a negative right margin; only part overlaps the text.",
    triggers: ["aside-desktop"],
  },
  {
    id: "§6.3", title: "The container imposes the 4:3 ratio",
    body: "aspect-ratio: 4/3 + object-fit: cover. A portrait uploaded to a side slot is cropped, never rendered tall enough to break the layout, and never promoted to its own band.",
    triggers: ["image-aside"],
  },
  {
    id: "§6.3", title: "Portrait cropped, not promoted",
    body: "This configuration drops a 3:4 portrait into the 4:3 slot. Emphasis must come from the author's intent, not the shape of the file, so the container crops it in place.",
    triggers: ["portrait"],
  },
  {
    id: "§6.4", title: "Section headings outdent into the left track",
    body: "Headings — and only headings — reach left past the text column into structural air. The offset is kept restrained so the heading still reads as attached to its text. Collapses on narrow viewports. Open item: assumed section headings only.",
    triggers: ["heading-desktop"],
  },
  {
    id: "§6.7", title: "Short text group → whitespace below (accepted)",
    body: "When the side element is taller than its text group, whitespace appears below the text. An accepted trade-off (§10), not a bug — the layout accommodates the content, not the reverse.",
    triggers: ["tall-aside"],
  },
  {
    id: "§6.6", title: "Row breaks at the next anchor / heading / media",
    body: "A derived row extends forward only until a row-breaking element. Adjacent anchors, an anchor before a heading, or an anchor near the end therefore produce a very short group.",
    triggers: ["short-group"],
  },
  {
    id: "§6.7", title: "On narrow viewports the wrap disappears",
    body: "Below the container-query threshold the side element becomes full width and enters normal flow; text returns to full measure. DOM order already matches reading order — no CSS order reshuffling.",
    triggers: ["aside-collapsed"],
  },
  {
    id: "§6.5", title: "Hero media — full-width, 16:9, spans columns",
    body: "A full-width principal image with real visual weight, spanning the left track, text column and margin together.",
    triggers: ["media-hero"],
  },
  {
    id: "§6.5", title: "Wide media — text column plus margin",
    body: "Media that reaches from the text column into the right margin area, wider than the measure but not full-bleed.",
    triggers: ["media-wide"],
  },
  {
    id: "§6.5", title: "Full-bleed media — breaks the container",
    body: "Media that breaks out edge-to-edge of the stage using the container-query width unit (100cqw).",
    triggers: ["media-bleed"],
  },
  {
    id: "§6.3", title: "Side elements never get their own band",
    body: "A tall or portrait image is not promoted to a full-width row; that weight is reserved for deliberate hero images.",
    triggers: ["image-aside"],
  },
];

const DECISIONS = [
  {
    title: "Text wraps around side elements",
    body: "Rather than a fixed narrower column. A fixed column would optically shrink images to the point of undermining the redesign. Wrapping keeps images useful; the narrow-measure floor keeps line-length variation to roughly 1.5×, which the eye adapts to. Earlier course versions reached more than 2×, which did not work.",
  },
  {
    title: "Whitespace below a short group is accepted",
    body: "The alternative is asking authors to write longer paragraphs to satisfy the layout. Content is the most valuable part of the course; the layout accommodates it. The case is rarer than it looks — derivation extends a group forward, so short groups only occur with adjacent anchors, an anchor before a heading, or an anchor near the end.",
  },
  {
    title: "Placement guidance, not writing guidance",
    body: "The recommendation to authors is “anchor images to substantive passages, not to brief transitional sentences.” A better placement decision, which authors already make — not a change to how they write.",
  },
  {
    title: "Image size must be a closed set",
    body: "Because image width determines the narrow measure, a free-form upload at native size could drop the measure below the floor. The authoring tool must offer a fixed set of sizes. A product constraint arising directly from the wrap decision — OpenCraft needs it up front.",
  },
];

/* ----------------------------------------------------------------------------
 * MARKUP — the BEM structure for the current rows (§6.8). Returned as an HTML
 * string with syntax spans; the app drops it into a <pre class="markup">.
 * --------------------------------------------------------------------------*/
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tag = (t) => `<span class="tag">${esc(t)}</span>`;
const cls = (c) => `<span class="cls">${esc(c)}</span>`;
const cm = (c) => `<span class="cm">${esc(c)}</span>`;

function buildMarkup(rows) {
  const L = [];
  L.push(`${tag("<div")} class="${cls("wgu-block wgu-block-flexible-content")}"${tag(">")}`);
  rows.forEach((row) => {
    const mod = "wgu-block-flexible-content__row " + "wgu-block-flexible-content__row" + row.type;
    if (row.type.startsWith("--media")) {
      L.push(`  ${tag("<div")} class="${cls(mod)}"${tag(">")}`);
      L.push(`    ${tag("<figure")} class="${cls("wgu-block-flexible-content__media")}"${tag(">")}`);
      L.push(`      ${tag("<img>")} ${tag("<figcaption")} class="${cls("…__figcaption")}"${tag(">…</figcaption>")}`);
      L.push(`    ${tag("</figure>")}`);
      L.push(`  ${tag("</div>")}`);
      return;
    }
    L.push(`  ${tag("<div")} class="${cls(mod)}"${tag(">")}   ${cm("<!-- flow-root: contains the float -->")}`);
    if (row.type === "--aside") {
      const isImg = row.aside.kind === "image";
      const asideCls = "wgu-block-flexible-content__aside " +
        "wgu-block-flexible-content__aside--size-" + row.aside.size +
        (isImg ? "" : " wgu-block-flexible-content__aside--callout");
      L.push(`    ${cm("<!-- side element FIRST → float wraps the text; reading order holds when it collapses -->")}`);
      L.push(`    ${tag("<div")} class="${cls(asideCls)}"${tag(">")}`);
      L.push(`      ${isImg ? tag("<figure><img> <figcaption/></figure>") : tag("<div class=…__callout-title>…</div> <p>…</p>")}`);
      L.push(`    ${tag("</div>")}`);
    }
    L.push(`    ${tag("<div")} class="${cls("wgu-block-flexible-content__text")}"${tag(">")}`);
    row.items.forEach((it) => {
      if (it.type === "h2" || it.type === "h3") L.push(`      ${tag("<" + it.type + ">…</" + it.type + ">")}   ${cm(it.type === "h2" ? "<!-- outdents -->" : "")}`);
      else if (it.type === "ul") L.push(`      ${tag("<ul><li>…</li></ul>")}`);
      else L.push(`      ${tag("<p>…</p>")}`);
    });
    L.push(`    ${tag("</div>")}`);
    L.push(`  ${tag("</div>")}`);
  });
  L.push(`${tag("</div>")}`);
  return L.join("\n");
}
