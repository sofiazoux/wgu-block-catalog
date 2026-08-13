/* ============================================================================
 * flexible-content.js — Flexible Content Block: content model, ROW DERIVATION,
 * renderer, and the named content configurations (§6.6, §8).
 *
 * The derivation is a real, re-runnable function that takes a flat content
 * array and returns rows (§6.6). Nothing about the row structure is hardcoded:
 * change the content and re-run, and the rows fall out. That the derivation is
 * visible and inspectable is the point of the prototype.
 *
 * No framework, no build. Plain classic script (NOT an ES module): ES module
 * imports are CORS-blocked from file://, and this must run opened directly from
 * a file (§4). Loaded via <script> in index.html; its top-level declarations
 * share the global scope with spec-data.js and app.js, in that load order.
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * OFFLINE IMAGE PLACEHOLDERS
 * The spec forbids external assets, but §6.3 (4:3 crop of a portrait) can only
 * be shown with a real image that HAS an intrinsic aspect ratio. So we build
 * SVG "photos" as data URIs: self-contained, offline, and with genuine
 * intrinsic dimensions, so object-fit: cover actually crops them.
 *
 * Each SVG paints a simple scene (sky gradient, horizon, a subject disc, and a
 * label) so that when the container crops it, the crop is visible.
 * --------------------------------------------------------------------------*/
function photo(w, h, hueA, hueB, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hueA},58%,64%)"/>
      <stop offset="1" stop-color="hsl(${hueB},52%,42%)"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.72}" cy="${h * 0.30}" r="${Math.min(w, h) * 0.14}" fill="hsla(${hueA},80%,88%,0.85)"/>
    <rect x="0" y="${h * 0.68}" width="${w}" height="${h * 0.32}" fill="hsla(${hueB},45%,30%,0.55)"/>
    <text x="${w / 2}" y="${h * 0.55}" font-family="monospace" font-size="${Math.round(Math.min(w, h) * 0.09)}"
      fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="middle">${label}</text>
    <text x="${w / 2}" y="${h * 0.55 + Math.min(w, h) * 0.11}" font-family="monospace" font-size="${Math.round(Math.min(w, h) * 0.06)}"
      fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="middle">${w}×${h}</text>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

/* A small library of intrinsic shapes. Portrait is the important one: dropped
 * into a 4:3 side slot it must be CROPPED, never allowed to grow tall. */
const PHOTOS = {
  landscape: photo(800, 600, 205, 220, "landscape 4:3"),   // matches the slot
  portrait:  photo(600, 900, 25, 12, "PORTRAIT 3:4"),      // will be cropped
  square:    photo(800, 800, 150, 165, "square 1:1"),      // cropped a little
  wide:      photo(1600, 900, 265, 280, "wide 16:9"),
  hero:      photo(1920, 1080, 200, 230, "hero 16:9"),
  bleed:     photo(2100, 900, 190, 215, "full-bleed 21:9"),
};

/* ----------------------------------------------------------------------------
 * CONTENT VOCABULARY — reusable prose so presets read cleanly. Course-themed
 * (foundations of behaviour) to match the WGU course.
 * --------------------------------------------------------------------------*/
const T = {
  short: "Behaviour rarely has a single cause.",
  med: "Behaviour rarely has a single cause. What a person does in a given moment is shaped at once by the situation in front of them and by patterns laid down long before.",
  long: "Behaviour rarely has a single cause. What a person does in a given moment is shaped at once by the situation directly in front of them and by patterns laid down long before they entered the room. Psychologists have spent more than a century trying to weigh these forces against each other, and the honest answer is that the balance shifts from one setting to the next. A framework that explains a classroom will not, on its own, explain a negotiation.",
  xlong: "Behaviour rarely has a single cause. What a person does in a given moment is shaped at once by the immediate situation and by patterns laid down long before they entered the room. Psychologists have spent more than a century trying to weigh these forces against each other, and the honest answer is that the balance shifts from one setting to the next. A framework that neatly explains a classroom will not, on its own, explain a negotiation, a crowd, or a quiet decision made alone. The task of this section is not to hand you one master theory but to give you several lenses and the judgement to know which one to reach for. That judgement is built slowly, case by case, and it is the real subject of everything that follows.",
};

const p = (text) => ({ type: "p", text });
const h2 = (text) => ({ type: "h2", text });
const h3 = (text) => ({ type: "h3", text });
const ul = (items) => ({ type: "ul", items });

/* An anchored paragraph: a normal paragraph carrying a side element. The
 * presence of `anchor` is exactly what §6.6 rule 1 keys on. */
const anchorImage = (text, { src = PHOTOS.landscape, size = "medium", caption = "" } = {}) =>
  ({ type: "p", text, anchor: { kind: "image", size, src, caption } });
const anchorCallout = (text, { size = "medium", title = "Key idea", body = "" } = {}) =>
  ({ type: "p", text, anchor: { kind: "callout", size, title, body } });

const media = (variant, src, caption = "") => ({ type: "media", variant, src, caption });

/* ============================================================================
 * ROW DERIVATION (§6.6) — the heart of the block.
 *
 *   1. A row begins at each paragraph that has a side element attached (anchor).
 *   2. The row extends forward until it meets a row-breaking element.
 *   3. Row-breaking elements: the next anchor, a heading, any media row, the
 *      end of the block.
 *   4. Content not part of an anchored row forms a plain text row.
 *
 * Returns an array of rows. Each row records WHY it ended (`brokeOn`) so the
 * spec panel can explain the derivation to developers.
 * ==========================================================================*/
function deriveRows(content) {
  const rows = [];
  const isHeading = (it) => it && (it.type === "h2" || it.type === "h3");
  const isMedia = (it) => it && it.type === "media";

  let i = 0;
  let textRow = null; // open plain-text row being accumulated

  const flushText = () => {
    if (textRow && textRow.items.length) rows.push(textRow);
    textRow = null;
  };

  while (i < content.length) {
    const item = content[i];

    // Rule: media is always its own row.
    if (isMedia(item)) {
      flushText();
      rows.push({ type: "--media-" + item.variant, items: [item] });
      i++;
      continue;
    }

    // Rule 1: an anchor opens a row.
    if (item.anchor) {
      flushText();
      const row = { type: "--aside", items: [item], aside: item.anchor, brokeOn: "end of block" };
      i++;
      // Rule 2 + 3: extend forward until a row-breaking element.
      while (i < content.length) {
        const next = content[i];
        if (next.anchor)      { row.brokeOn = "next anchor"; break; }
        if (isHeading(next))  { row.brokeOn = "heading"; break; }
        if (isMedia(next))    { row.brokeOn = "media row"; break; }
        row.items.push(next);
        i++;
      }
      rows.push(row);
      continue;
    }

    // Rule 4: everything else accumulates into a plain text row.
    if (!textRow) textRow = { type: "--text", items: [] };
    textRow.items.push(item);
    i++;
  }
  flushText();
  return rows;
}

/* ----------------------------------------------------------------------------
 * RENDERER — rows -> BEM DOM (§6.8). Pure DOM construction, no innerHTML for
 * content (avoids any injection surprise; the SVG data URIs are the only markup
 * we inject and they are ours).
 * --------------------------------------------------------------------------*/
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const B = "wgu-block-flexible-content";

function renderTextItem(item) {
  if (item.type === "h2") return el("h2", null, item.text);
  if (item.type === "h3") return el("h3", null, item.text);
  if (item.type === "ul") {
    const list = el("ul");
    item.items.forEach((t) => list.appendChild(el("li", null, t)));
    return list;
  }
  return el("p", null, item.text);
}

function renderAside(aside) {
  const wrap = el("div", `${B}__aside ${B}__aside--size-${aside.size}`);
  if (aside.kind === "image") {
    const fig = el("figure");
    const img = el("img");
    img.src = aside.src;
    img.alt = ""; // decorative in this specimen
    fig.appendChild(img);
    if (aside.caption) fig.appendChild(el("figcaption", `${B}__figcaption`, aside.caption));
    wrap.appendChild(fig);
  } else {
    wrap.classList.add(`${B}__aside--callout`);
    if (aside.title) wrap.appendChild(el("div", `${B}__callout-title`, aside.title));
    if (aside.body) wrap.appendChild(el("p", null, aside.body));
  }
  return wrap;
}

function renderMedia(item) {
  const fig = el("figure", `${B}__media`);
  const img = el("img");
  img.src = item.src;
  img.alt = "";
  fig.appendChild(img);
  if (item.caption) fig.appendChild(el("figcaption", `${B}__figcaption`, item.caption));
  return fig;
}

function renderRows(rows) {
  const block = el("div", `wgu-block ${B}`);
  rows.forEach((row) => {
    const rowEl = el("div", `${B}__row ${B}__row${row.type}`);
    rowEl.dataset.rowType = row.type.replace(/^--/, ""); // for the row-boundary inspector

    if (row.type.startsWith("--media")) {
      rowEl.appendChild(renderMedia(row.items[0]));
      block.appendChild(rowEl);
      return;
    }

    // Aside rows put the side element FIRST in the DOM so the float wraps the
    // following text, AND so that when the float collapses on narrow viewports
    // the reading order (side element, then its passage) is already correct —
    // no CSS `order` needed (§6.7).
    const textWrap = el("div", `${B}__text`);
    if (row.type === "--aside") rowEl.appendChild(renderAside(row.aside));
    row.items.forEach((it) => textWrap.appendChild(renderTextItem(it)));
    rowEl.appendChild(textWrap);
    block.appendChild(rowEl);
  });
  return block;
}

/* ============================================================================
 * NAMED CONFIGURATIONS (§8) — a small, demo-ready set. Happy path first, then
 * the edge cases, which matter as much as the happy path: showing them
 * deliberately is what builds confidence.
 * ==========================================================================*/
const PRESETS = [
  /* ---------- Default (no category) + Optional components ---------- */
  {
    id: "prose", group: "Default", label: "Plain prose",
    description: "No side elements. Full reading measure throughout.",
    content: [h2("What shapes behaviour"), p(T.long), p(T.med), p(T.xlong)],
  },
  {
    id: "image-mid", group: "Optional component", label: "Image, wrapping",
    description: "A medium image anchored to a substantive passage; text wraps.",
    content: [
      h2("What shapes behaviour"), p(T.long),
      anchorImage(T.xlong, { src: PHOTOS.landscape, size: "medium", caption: "Figure 1. A situation and its history act at once." }),
      p(T.long), p(T.med),
    ],
  },
  {
    id: "callout-mid", group: "Optional component", label: "Callout, wrapping",
    description: "A callout in the side slot instead of an image; text wraps.",
    content: [
      h2("What shapes behaviour"), p(T.long),
      anchorCallout(T.xlong, { size: "medium", title: "Key idea", body: "Emphasis must come from the author's intent, not from the shape of a file." }),
      p(T.med),
    ],
  },
  {
    id: "hero", group: "Optional component", label: "Hero image",
    description: "A full-width principal image, 16:9, spanning multiple columns.",
    content: [
      h2("What shapes behaviour"),
      media("hero", PHOTOS.hero, "A deliberate hero image carries real visual weight."),
      p(T.long), p(T.med),
    ],
  },
  {
    id: "media-wide", group: "Optional component", label: "Wide media",
    description: "Media spanning the text column plus the margin area.",
    content: [p(T.long), media("wide", PHOTOS.wide, "Wide media reaches into the right margin."), p(T.long)],
  },
  {
    id: "media-bleed", group: "Optional component", label: "Full-bleed media",
    description: "Media breaking the container, edge to edge of the stage.",
    content: [p(T.long), media("bleed", PHOTOS.bleed, "A full-bleed band breaks the reading container."), p(T.long)],
  },

  /* ---------- Edge cases ---------- */
  {
    id: "tall-aside", group: "Edge cases", label: "Tall side element",
    description: "A large image beside one short paragraph → whitespace below the text. Accepted trade-off (§10).",
    content: [
      h2("A short passage"),
      anchorImage(T.short, { src: PHOTOS.landscape, size: "large", caption: "The image is taller than the passage it sits beside." }),
      h3("Next heading breaks the row"), p(T.med),
    ],
  },
  {
    id: "adjacent-anchors", group: "Edge cases", label: "Two adjacent anchors",
    description: "Anchors on consecutive paragraphs → each row is a very short group.",
    content: [
      h2("Two anchors in a row"),
      anchorImage(T.med, { src: PHOTOS.landscape, size: "small", caption: "First anchor." }),
      anchorImage(T.med, { src: PHOTOS.square, size: "small", caption: "Second anchor, immediately after." }),
      p(T.long),
    ],
  },
  {
    id: "anchor-before-heading", group: "Edge cases", label: "Anchor before heading",
    description: "The row breaks at the heading → the anchored group holds just one paragraph.",
    content: [
      h2("First section"),
      anchorImage(T.med, { src: PHOTOS.landscape, size: "medium", caption: "The heading below ends this row." }),
      h2("Second section"), p(T.long),
    ],
  },
  {
    id: "anchor-near-end", group: "Edge cases", label: "Anchor near end",
    description: "The forward extension runs out of content → a short trailing group.",
    content: [h2("Nearly done"), p(T.long), p(T.med), anchorImage(T.short, { src: PHOTOS.landscape, size: "medium", caption: "Only a short tail follows." })],
  },
  {
    id: "portrait-crop", group: "Edge cases", label: "Portrait → cropped",
    description: "A 3:4 portrait dropped into the 4:3 slot → cropped by the container, never grown tall (§6.3).",
    content: [
      h2("The container imposes the ratio"),
      anchorImage(T.xlong, { src: PHOTOS.portrait, size: "medium", caption: "Portrait source, cropped to 4:3 — not promoted to its own band." }),
      p(T.med),
    ],
  },
  {
    id: "measure-floor", group: "Edge cases", label: "Measure at floor",
    description: "The largest image size drives the narrow measure to exactly its 35ch floor (§6.1). Turn on the measure guide.",
    content: [
      h2("At the 35ch floor"),
      anchorImage(T.xlong, { src: PHOTOS.landscape, size: "large", caption: "Largest size → narrow measure sits on the floor." }),
      p(T.long),
    ],
  },
  {
    id: "length-extremes", group: "Edge cases", label: "Short / long paragraphs",
    description: "A long run with no anchors, plus very short and very long paragraphs.",
    content: [
      h2("Length extremes"),
      p(T.short), p(T.xlong), p(T.short), p(T.long),
      h3("A long run with no anchors"),
      p(T.long), p(T.xlong), p(T.med),
    ],
  },
];

function presetById(id) {
  return PRESETS.find((x) => x.id === id) || PRESETS[0];
}
