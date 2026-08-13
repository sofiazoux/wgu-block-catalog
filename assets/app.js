/* ============================================================================
 * app.js — catalog chrome orchestration.
 *
 * Responsibilities: hash routing (catalog ↔ detail), building the catalog
 * index and the block detail view, and the live wiring of the detail view —
 * resizable stage + px readout, content-configuration presets, inspector
 * overlays, the live measure computation, and the triggered-rule highlighting
 * in the spec panel.
 *
 * Plain classic script (NOT an ES module) so it runs from file:// — ES module
 * imports are CORS-blocked there. index.html loads flexible-content.js and
 * spec-data.js BEFORE this file, so their top-level declarations (PRESETS,
 * presetById, deriveRows, renderRows, RULES, DECISIONS, buildMarkup) are in
 * scope here as globals. No framework, no build, offline.
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * BLOCK REGISTRY — the catalog is designed to grow (§5.1). Adding a block is a
 * single entry here; nothing else in the chrome is per-block.
 * --------------------------------------------------------------------------*/
const BLOCKS = [
  {
    id: "flexible-content",
    name: "Flexible Content Block",
    status: "in-review",
    statusLabel: "In review",
    desc: "Prose with images and callouts that text wraps around, derived rows, and a protected reading measure.",
    ready: true,
  },
  {
    id: "interactive",
    name: "Interactive Block",
    status: "proposed",
    statusLabel: "Proposed",
    desc: "An interactive learning element. Deferred — scaffolded here so it can be filled in without rework.",
    ready: false,
  },
];
const blockById = (id) => BLOCKS.find((b) => b.id === id);

const app = document.getElementById("app");
const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/* ============================================================================
 * ROUTER
 * ==========================================================================*/
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const m = hash.match(/^\/block\/([\w-]+)/);
  if (m && blockById(m[1])) renderDetail(m[1]);
  else renderCatalog();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ============================================================================
 * TOP BAR — global brand only. (The "proposal pending feedback" framing now
 * lives in the detail header text; the standing chip was removed at the client's
 * request.)
 * ==========================================================================*/
function topbar() {
  const bar = h("div", "topbar");
  const brand = h("a", "topbar__brand");
  brand.href = "#/";
  brand.innerHTML = `Block catalog <span class="mono">WGU · OpenCraft</span>`;
  bar.appendChild(brand);
  return bar;
}

/* A "back to catalog" link, placed above a detail-view title. */
function backLink() {
  const back = h("a", "detail__back", "← all blocks");
  back.href = "#/";
  return back;
}

/* ============================================================================
 * CATALOG INDEX (§5.1)
 * ==========================================================================*/
function renderCatalog() {
  app.replaceChildren();
  app.appendChild(topbar());

  const wrap = h("div", "catalog");
  const lede = h("div", "catalog__lede");
  lede.appendChild(h("h1", null, "Content blocks"));
  lede.appendChild(h("p", null,
    "A growing catalog of the content blocks proposed for the program. Each detail view renders the block live and lets you interrogate it — change the content, force edge cases, inspect the grid, and resize the frame. It replaces a static walkthrough for anything involving behaviour."));
  wrap.appendChild(lede);

  const grid = h("div", "card-grid");
  BLOCKS.forEach((b) => grid.appendChild(catalogCard(b)));
  wrap.appendChild(grid);
  app.appendChild(wrap);
}

function catalogCard(b) {
  const card = h("a", "card");
  card.href = `#/block/${b.id}`;

  const prev = h("div", "card__preview");
  prev.appendChild(b.ready ? miniFlexiblePreview() : miniDeferredPreview());
  card.appendChild(prev);

  const body = h("div", "card__body");
  body.appendChild(h("div", "card__title", b.name));
  body.appendChild(h("div", "card__desc", b.desc));
  const foot = h("div", "card__foot");
  foot.appendChild(statusBadge(b.status, b.statusLabel));
  foot.appendChild(h("span", "card__id mono", b.id));
  body.appendChild(foot);
  card.appendChild(body);
  return card;
}

function statusBadge(status, label) {
  return h("span", `badge badge--${status}`, label);
}

/* Tiny static previews — pure CSS, no live render, cheap to paint in a grid. */
function miniFlexiblePreview() {
  const w = h("div");
  w.style.cssText = "font-family:var(--c-mono);";
  w.innerHTML = `
    <div style="display:flex;gap:8px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
        <div style="height:8px;width:70%;background:#223e5d;border-radius:2px;"></div>
        <div style="height:5px;width:100%;background:#e2e5e8;border-radius:2px;"></div>
        <div style="height:5px;width:100%;background:#e2e5e8;border-radius:2px;"></div>
        <div style="height:5px;width:92%;background:#e2e5e8;border-radius:2px;"></div>
        <div style="height:5px;width:96%;background:#e2e5e8;border-radius:2px;"></div>
      </div>
      <div style="width:74px;height:56px;background:linear-gradient(160deg,#6fb0c8,#33779e);border-radius:4px;"></div>
    </div>
    <div style="margin-top:6px;display:flex;flex-direction:column;gap:5px;">
      <div style="height:5px;width:100%;background:#e2e5e8;border-radius:2px;"></div>
      <div style="height:5px;width:88%;background:#e2e5e8;border-radius:2px;"></div>
    </div>`;
  return w;
}
function miniDeferredPreview() {
  const w = h("div");
  w.style.cssText = "height:100%;display:flex;align-items:center;justify-content:center;color:#aeb4ba;font-family:var(--c-mono);font-size:12px;border:1px dashed #d3d7db;border-radius:6px;";
  w.textContent = "deferred";
  return w;
}

/* ============================================================================
 * DETAIL VIEW (§5.2)
 * ==========================================================================*/
function renderDetail(id) {
  const b = blockById(id);
  app.replaceChildren();
  app.appendChild(topbar());
  if (!b.ready) return renderDeferredDetail(b);

  // ---- state ----
  const state = {
    presetId: PRESETS[0].id,
    grid: false,
    rows: false,
    measure: false,
    specCollapsed: true, // start collapsed so the specimen dominates (§ proportion)
  };

  const detail = h("div", "detail");

  // Header — compact: back-link above the title, then title + status.
  const header = h("div", "detail__header");
  header.appendChild(backLink());
  const titleRow = h("div", "detail__title-row");
  titleRow.appendChild(h("h1", "detail__title", b.name));
  titleRow.appendChild(statusBadge(b.status, b.statusLabel));
  header.appendChild(titleRow);
  detail.appendChild(header);

  // Workbench: rail | stage | spec
  const workbench = h("div", "workbench");

  // -- Rail --
  // Ordered deliberately: the default state first, then the optional
  // components, then the inspector overlays, and the edge cases last.
  const rail = h("div", "rail");
  const presetsIn = (group) => PRESETS.filter((pr) => pr.group === group);

  const presetButton = (pr) => {
    const btn = h("button", "preset");
    btn.type = "button";
    btn.dataset.preset = pr.id;
    btn.title = pr.label;
    btn.setAttribute("aria-pressed", String(pr.id === state.presetId));
    btn.appendChild(h("span", "preset__name", pr.label));
    btn.addEventListener("click", () => { state.presetId = pr.id; refresh(); });
    return btn;
  };
  const presetGroup = (name, list) => {
    const gEl = h("div", "preset-group");
    if (name) gEl.appendChild(h("div", "preset-group__name", name));
    list.forEach((pr) => gEl.appendChild(presetButton(pr)));
    return gEl;
  };

  // 1) Content configuration — default (no sub-label), then optional components
  const cfg = h("div", "rail__section");
  cfg.appendChild(h("p", "rail__label", "Content configuration"));
  cfg.appendChild(presetGroup(null, presetsIn("Default")));
  cfg.appendChild(presetGroup("Optional component", presetsIn("Optional component")));
  rail.appendChild(cfg);

  // 2) Inspector
  const insp = h("div", "rail__section");
  insp.appendChild(h("p", "rail__label", "Inspector"));
  insp.appendChild(toggle("Grid tracks + margin", () => state.grid, (v) => { state.grid = v; refresh(); }));
  insp.appendChild(toggle("Row boundaries", () => state.rows, (v) => { state.rows = v; refresh(); }));
  insp.appendChild(toggle("Measure guide", () => state.measure, (v) => { state.measure = v; refresh(); }));
  rail.appendChild(insp);

  // 3) Edge cases — last
  const edge = h("div", "rail__section");
  edge.appendChild(h("p", "rail__label", "Edge cases"));
  edge.appendChild(presetGroup(null, presetsIn("Edge cases")));
  rail.appendChild(edge);

  workbench.appendChild(rail);

  // -- Stage --
  const stageWrap = h("div", "stage-wrap");
  const toolbar = h("div", "stage-toolbar");
  // width readout: label in plain type, the px VALUE in mono (Group 3 rule —
  // monospace is reserved for technical values).
  const widthReadout = h("span", "readout");
  widthReadout.innerHTML = 'stage <b class="mono">—</b> px';
  const widthValue = widthReadout.querySelector("b");
  // live real-character count of the longest rendered line (calibration aid).
  const charReadout = h("span", "readout");
  charReadout.innerHTML = 'longest line <b class="mono">—</b> chars';
  const charValue = charReadout.querySelector("b");
  const stagePresets = h("div", "stage-presets");
  [["Mobile", 360], ["Tablet", 760], ["Wide", 980]].forEach(([label, px]) => {
    const b2 = h("button", null, label);
    b2.type = "button";
    b2.addEventListener("click", () => { stage.style.width = px + "px"; layout(); });
    stagePresets.appendChild(b2);
  });
  toolbar.appendChild(widthReadout);
  toolbar.appendChild(charReadout);
  toolbar.appendChild(h("span", "stage-toolbar__spacer"));
  toolbar.appendChild(stagePresets);
  stageWrap.appendChild(toolbar);
  // the state description, in plain readable type on its own line
  const presetReadout = h("p", "stage-caption", "");
  stageWrap.appendChild(presetReadout);

  // stage + custom drag handle. Native `resize: horizontal` only exposed a
  // corner grip and proved unreliable, so the stage sits in a flex frame with
  // a full-height edge handle driven by Pointer Events — works with mouse AND
  // trackpad, resizes continuously, and the ResizeObserver keeps px + chars live.
  const stageFrame = h("div", "stage-frame");
  const stage = h("div", "stage");
  const stageInner = h("div", "stage__inner");
  const overlay = h("div", "overlay");
  stageInner.appendChild(overlay);
  stage.appendChild(stageInner);
  const handle = h("div", "stage__handle");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.title = "Drag to resize the stage";
  stageFrame.appendChild(stage);
  stageFrame.appendChild(handle);
  stageWrap.appendChild(stageFrame);
  workbench.appendChild(stageWrap);

  // drag-to-resize (pointer events cover mouse + trackpad)
  let dragX = 0, dragW = 0;
  const onMove = (e) => {
    const w = Math.max(280, Math.min(2000, dragW + (e.clientX - dragX)));
    stage.style.width = w + "px";
    layout();
  };
  const onUp = (e) => {
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    handle.classList.remove("is-dragging");
  };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragX = e.clientX;
    dragW = stage.offsetWidth;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    handle.classList.add("is-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // -- Spec panel --
  const spec = h("div", "spec");
  const specBar = h("div", "spec__bar");
  specBar.appendChild(h("h2", null, "Specification"));
  const collapseBtn = h("button", "spec__collapse", "⟩");
  collapseBtn.type = "button";
  collapseBtn.title = "Collapse / expand the spec panel";
  collapseBtn.addEventListener("click", () => {
    state.specCollapsed = !state.specCollapsed;
    workbench.classList.toggle("is-spec-collapsed", state.specCollapsed);
    spec.classList.toggle("is-spec-collapsed", state.specCollapsed);
    collapseBtn.textContent = state.specCollapsed ? "⟨" : "⟩";
    layout(); // geometry changed
  });
  specBar.appendChild(collapseBtn);
  spec.appendChild(specBar);
  const specBody = h("div", "spec__body");
  spec.appendChild(specBody);
  workbench.appendChild(spec);

  // apply the initial (collapsed) spec state
  workbench.classList.toggle("is-spec-collapsed", state.specCollapsed);
  spec.classList.toggle("is-spec-collapsed", state.specCollapsed);
  collapseBtn.textContent = state.specCollapsed ? "⟨" : "⟩";

  detail.appendChild(workbench);
  app.appendChild(detail);

  // ---- rendering pipeline ----
  let currentRows = [];
  let rulesEl = null;                 // the (persistent) active-rules container
  let glyphPx = measureGlyph();       // px per 1ch  (for the ch-based zones)
  let avgChar = measureAvgChar();     // px per average character (for real chars)

  function refresh() {
    // reflect preset selection
    rail.querySelectorAll(".preset").forEach((el) =>
      el.setAttribute("aria-pressed", String(el.dataset.preset === state.presetId)));
    // reflect inspector toggles on the stage
    stage.classList.toggle("show-rows", state.rows);

    const preset = presetById(state.presetId);
    presetReadout.textContent = preset.description;

    currentRows = deriveRows(preset.content);
    const block = renderRows(currentRows);
    // mount block into inner, keeping the overlay on top
    stageInner.querySelectorAll(".wgu-block").forEach((n) => n.remove());
    stageInner.appendChild(block);

    rulesEl = renderSpec(specBody, currentRows); // static parts + empty rules box
    layout();
  }

  function layout() {
    const trig = computeTriggers(currentRows, stageInner, glyphPx);
    // width readout: the container width the block actually sees
    widthValue.textContent = Math.round(containerWidth(stage));
    // live real-character count of the longest rendered line
    const block = stageInner.querySelector(".wgu-block");
    const lc = block ? longestLineChars(block, avgChar) : 0;
    charValue.textContent = lc || "—";
    drawOverlays(overlay, stageInner, glyphPx, avgChar, { grid: state.grid, measure: state.measure, rows: currentRows, trig });
    // rebuild the active-rules list (the active set depends on live geometry)
    updateRules(rulesEl, trig);
  }

  // live: react to the resizable frame
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  // fonts can change glyph metrics; recompute once ready
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    glyphPx = measureGlyph();
    avgChar = measureAvgChar();
    refresh();
  });

  refresh();
}

/* ---- Deferred (Interactive) detail: same structure, scaffolded (§7) ---- */
function renderDeferredDetail(b) {
  const detail = h("div", "detail");
  const header = h("div", "detail__header");
  header.appendChild(backLink());
  const titleRow = h("div", "detail__title-row");
  titleRow.appendChild(h("h1", "detail__title", b.name));
  titleRow.appendChild(statusBadge(b.status, b.statusLabel));
  header.appendChild(titleRow);
  const framing = h("p", "detail__framing");
  framing.innerHTML = "<strong>Deferred.</strong> This block is proposed but not yet specified. The detail view is scaffolded to the same structure as other blocks so it can be filled in later without rework — content configuration, resizable stage, inspector, and spec panel.";
  header.appendChild(framing);
  detail.appendChild(header);

  const workbench = h("div", "workbench");
  const rail = h("div", "rail");
  rail.appendChild(h("p", "rail__label", "Content configuration"));
  rail.appendChild(h("div", "preset-group__name", "Awaiting specification"));
  workbench.appendChild(rail);

  const stageWrap = h("div", "stage-wrap");
  const stage = h("div", "stage");
  const inner = h("div", "stage__inner");
  const ph = h("div");
  ph.style.cssText = "min-height:220px;display:flex;align-items:center;justify-content:center;color:#aeb4ba;font-family:var(--c-mono);font-size:13px;text-align:center;";
  ph.textContent = "Interactive Block — to be defined";
  inner.appendChild(ph);
  stage.appendChild(inner);
  stageWrap.appendChild(stage);
  workbench.appendChild(stageWrap);

  const spec = h("div", "spec");
  const specBar = h("div", "spec__bar");
  specBar.appendChild(h("h2", null, "Specification"));
  spec.appendChild(specBar);
  const body = h("div", "spec__body");
  body.appendChild(h("p", "decision", "No rules yet. When this block is specified, its rules and markup appear here, highlighted as the configuration triggers them — exactly like the Flexible Content Block."));
  spec.appendChild(body);
  workbench.appendChild(spec);

  detail.appendChild(workbench);
  app.appendChild(detail);
}

/* ============================================================================
 * CONTROLS
 * ==========================================================================*/
function toggle(label, get, set) {
  const btn = h("button", "toggle");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(get()));
  btn.appendChild(h("span", "toggle__box"));
  btn.appendChild(h("span", null, label));
  btn.addEventListener("click", () => {
    const v = !(btn.getAttribute("aria-pressed") === "true");
    btn.setAttribute("aria-pressed", String(v));
    set(v);
  });
  return btn;
}

/* ============================================================================
 * MEASUREMENT + GEOMETRY
 * ==========================================================================*/
/* Width of 1ch in the block's body context (Lato 16px — the block body size),
 * so we can turn the ch-based zone widths into pixels for the overlays and the
 * measure guide. Must match .wgu-block-flexible-content's font-size. */
function measureGlyph() {
  const probe = h("span", null, "0000000000");
  probe.style.cssText = "position:absolute;visibility:hidden;font-family:'Lato',system-ui,sans-serif;font-size:16px;white-space:pre;";
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return w || 8;
}

/* Average character width in the body font — the basis for the REAL character
 * count. The ch unit (glyph "0") overstates line length by ~1.35× in Lato, so
 * the measure guide converts px→characters through this instead. Measured from
 * a realistic English sample rather than a single glyph. */
function measureAvgChar() {
  const sample = "Behaviour rarely has a single cause. What a person does in a given moment is shaped at once by the situation directly in front of them and by patterns laid down long before they entered the room.";
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = "16px Lato, system-ui, sans-serif";
  return ctx.measureText(sample).width / sample.length || 7;
}

/* Real characters in the longest rendered line: measure every <p>'s line boxes
 * (one client rect per line) and convert the widest to characters. Live — it
 * recomputes on every resize, so the reported count is what the eye sees. */
function longestLineChars(block, avgChar) {
  let max = 0;
  block.querySelectorAll("p").forEach((p) => {
    if (!p.firstChild) return;
    const range = document.createRange();
    range.selectNodeContents(p);
    for (const r of range.getClientRects()) if (r.width > max) max = r.width;
  });
  return max ? Math.round(max / avgChar) : 0;
}

/* The inline size the block's container query sees = stage content box. */
function containerWidth(stage) {
  const cs = getComputedStyle(stage);
  return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

/* Zone widths in ch, mirrored from flexible-content.css. Kept here as plain
 * numbers so the overlay maths is legible; the CSS is the source of truth. */
const ZONES = { leftTrack: 5, measure: 51, marginArea: 11, gutter: 2 };
const OVERLAP = { small: 10, medium: 12, large: 14 };

/* Is the desktop float layout active? Read it straight off a rendered aside —
 * getComputedStyle reflects the container-query result exactly. Falls back to
 * a width heuristic when there is no aside to sample. */
function isCollapsed(stageInner) {
  const aside = stageInner.querySelector(".wgu-block-flexible-content__aside");
  if (aside) return getComputedStyle(aside).float === "none";
  const stage = stageInner.closest(".stage");
  return containerWidth(stage) < 640; // 40rem threshold
}

function computeTriggers(rows, stageInner, glyphPx) {
  const t = new Set();
  const collapsed = isCollapsed(stageInner);
  if (collapsed) t.add("collapsed");

  const asideRows = rows.filter((r) => r.type === "--aside");
  if (asideRows.length) {
    t.add("aside");
    if (!collapsed) t.add("aside-desktop");
    if (collapsed) t.add("aside-collapsed"); // the "wrap disappears" rule only
                                             // makes sense when there IS a wrap
    asideRows.forEach((r) => {
      if (r.aside.kind === "image") t.add("image-aside");
      if (r.aside.kind === "callout") t.add("callout-aside");
    });
  }
  // portrait: the portrait-crop preset uses PHOTOS.portrait, whose SVG label
  // (URI-encoded) contains "PORTRAIT" — a cheap, offline way to flag it.
  if (rows.some((r) => r.type === "--aside" && r.aside.kind === "image" && (r.aside.src || "").includes("PORTRAIT"))) t.add("portrait");

  const hasHeading = rows.some((r) => (r.items || []).some((it) => it.type === "h2" || it.type === "h3"));
  if (hasHeading) { t.add("heading"); if (!collapsed) t.add("heading-desktop"); }

  if (rows.length > 1) t.add("multi-row");
  rows.forEach((r) => { if (r.type.startsWith("--media")) t.add("media-" + r.type.replace("--media-", "")); });

  // short group: an aside row that broke on the next anchor or a heading, or a
  // trailing aside row holding only its anchor paragraph.
  asideRows.forEach((r) => {
    if (r.brokeOn === "next anchor" || r.brokeOn === "heading") t.add("short-group");
    if (r.brokeOn === "end of block" && r.items.length <= 1) t.add("short-group");
  });

  // narrow measure floor: min narrow across aside rows (worst case).
  let minNarrow = Infinity;
  asideRows.forEach((r) => {
    const narrow = ZONES.measure - ZONES.gutter - (OVERLAP[r.aside.size] || 12);
    minNarrow = Math.min(minNarrow, narrow);
  });
  if (isFinite(minNarrow)) {
    t.narrowCh = minNarrow;
    if (minNarrow <= 35) t.add("measure-floor"); // 35ch = the calibrated floor
  }

  // tall aside → whitespace below (runtime): compare aside height to its text.
  if (!collapsed) {
    stageInner.querySelectorAll(".wgu-block-flexible-content__row--aside").forEach((rowEl) => {
      const aside = rowEl.querySelector(".wgu-block-flexible-content__aside");
      const text = rowEl.querySelector(".wgu-block-flexible-content__text");
      if (aside && text && aside.offsetHeight > text.offsetHeight + 8) t.add("tall-aside");
    });
  }
  return t;
}

/* ============================================================================
 * INSPECTOR OVERLAYS
 * ==========================================================================*/
function drawOverlays(overlay, stageInner, glyphPx, avgChar, opts) {
  overlay.replaceChildren();
  const block = stageInner.querySelector(".wgu-block");
  if (!block) return;
  const innerRect = stageInner.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const x0 = blockRect.left - innerRect.left;   // block left within the overlay
  const collapsed = opts.trig.has("collapsed");
  const realCh = (ch) => Math.round((ch * glyphPx) / avgChar); // ch → real chars

  // -- Grid tracks + margin --
  if (opts.grid && !collapsed) {
    const track = x0;
    const measure = x0 + ZONES.leftTrack * glyphPx;
    const margin = measure + ZONES.measure * glyphPx;
    zone(overlay, "track",   track,   ZONES.leftTrack * glyphPx, `left track ${ZONES.leftTrack}ch`);
    zone(overlay, "measure", measure, ZONES.measure * glyphPx, `text column ${ZONES.measure}ch`);
    zone(overlay, "margin",  margin,  ZONES.marginArea * glyphPx, `margin ${ZONES.marginArea}ch`);
  } else if (opts.grid && collapsed) {
    const label = h("div", "overlay__zone-label", "collapsed — single column, no tracks");
    label.style.top = "4px"; label.style.left = x0 + "px"; label.style.position = "absolute";
    overlay.appendChild(label);
  }

  // -- Measure guide -- labels report REAL characters, not nominal ch.
  if (opts.measure) {
    if (!collapsed) {
      const measureLeft = x0 + ZONES.leftTrack * glyphPx;
      guide(overlay, measureLeft + ZONES.measure * glyphPx,
        `wide measure ${ZONES.measure}ch ≈ ${realCh(ZONES.measure)} chars`, false);
      if (isFinite(opts.trig.narrowCh)) {
        const narrow = opts.trig.narrowCh;
        const fail = narrow < 35;                    // 35ch = calibrated floor
        guide(overlay, measureLeft + narrow * glyphPx,
          `narrow measure ${narrow}ch ≈ ${realCh(narrow)} chars ${fail ? "✕ below floor" : "✓ ≥ 35ch floor"}`, fail);
      }
    } else {
      guide(overlay, x0 + ZONES.measure * glyphPx,
        `collapsed — full measure ≈ ${realCh(ZONES.measure)} chars, wrap off`, false);
    }
  }
}

function zone(overlay, kind, left, width, label) {
  const z = h("div", `overlay__zone overlay__zone--${kind}`);
  z.style.left = left + "px";
  z.style.width = width + "px";
  z.appendChild(h("div", "overlay__zone-label", label));
  overlay.appendChild(z);
}
function guide(overlay, left, label, fail) {
  const g = h("div", "overlay__guide");
  g.style.left = left + "px";
  const l = h("div", `overlay__guide-label${fail ? " is-fail" : ""}`, label);
  g.appendChild(l);
  overlay.appendChild(g);
}

/* ============================================================================
 * SPEC PANEL RENDER + HIGHLIGHT
 * ==========================================================================*/
/* Builds the static parts (markup, decision log) and an empty rules container,
 * which updateRules() then fills with ONLY the rules active in the current
 * configuration. Returns the rules container so layout() can refresh it as the
 * live geometry (collapse state, tall aside) changes the active set. */
function renderSpec(body, rows) {
  body.replaceChildren();

  // Rules (filled by updateRules)
  const s1 = h("div", "spec__section");
  s1.appendChild(h("h3", null, "Active rules"));
  const rulesEl = h("div", "rules");
  s1.appendChild(rulesEl);
  body.appendChild(s1);

  // Markup
  const s2 = h("div", "spec__section");
  s2.appendChild(h("h3", null, "Markup for these rows"));
  const pre = h("pre", "markup");
  pre.innerHTML = buildMarkup(rows);
  s2.appendChild(pre);
  body.appendChild(s2);

  // Decision log (§10)
  const s3 = h("div", "spec__section");
  s3.appendChild(h("h3", null, "Decision log"));
  DECISIONS.forEach((d) => {
    const dEl = h("div", "decision");
    dEl.appendChild(h("h4", null, d.title));
    dEl.appendChild(h("p", null, d.body));
    dEl.querySelector("p").style.margin = "0";
    s3.appendChild(dEl);
  });
  body.appendChild(s3);

  return rulesEl;
}

/* Render ONLY the rules the current configuration triggers (§5.2). The list
 * changes as you switch presets or resize. */
function updateRules(container, trig) {
  if (!container) return;
  const active = RULES.filter((r) => r.always || (r.triggers || []).some((k) => trig.has(k)));
  container.replaceChildren();
  active.forEach((r) => {
    const el = h("div", "rule");
    const head = h("div", "rule__head");
    head.appendChild(h("span", "rule__id mono", r.id));
    head.appendChild(h("span", "rule__title", r.title));
    el.appendChild(head);
    const p = h("p", null, r.body);
    p.style.margin = "6px 0 0";
    el.appendChild(p);
    container.appendChild(el);
  });
  if (!active.length) container.appendChild(h("p", "rules__empty", "No layout rules apply to this configuration."));
}

/* Boot */
route();
