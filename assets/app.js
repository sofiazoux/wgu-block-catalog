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
 * TOP BAR — with the standing "proposal pending feedback" flag (§11).
 * ==========================================================================*/
function topbar(backToCatalog) {
  const bar = h("div", "topbar");
  const brand = h("a", "topbar__brand");
  brand.href = "#/";
  brand.innerHTML = `Block catalog <span class="mono">WGU · OpenCraft</span>`;
  bar.appendChild(brand);
  if (backToCatalog) {
    const back = h("a", "back-link", "← all blocks");
    back.href = "#/";
    bar.appendChild(back);
  }
  bar.appendChild(h("div", "topbar__spacer"));
  const flag = h("span", "proposal-flag", "Proposal — pending feedback");
  flag.title = "This catalog is a proposal. The authoring model shown is intent, not commitment; parts depend on open questions with OpenCraft.";
  bar.appendChild(flag);
  return bar;
}

/* ============================================================================
 * CATALOG INDEX (§5.1)
 * ==========================================================================*/
function renderCatalog() {
  app.replaceChildren();
  app.appendChild(topbar(false));

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
  app.appendChild(topbar(true));
  if (!b.ready) return renderDeferredDetail(b);

  // ---- state ----
  const state = {
    presetId: PRESETS[0].id,
    grid: false,
    rows: false,
    measure: false,
    specCollapsed: false,
  };

  const detail = h("div", "detail");

  // Header
  const header = h("div", "detail__header");
  const titleRow = h("div", "detail__title-row");
  titleRow.appendChild(h("h1", "detail__title", b.name));
  titleRow.appendChild(statusBadge(b.status, b.statusLabel));
  header.appendChild(titleRow);
  const framing = h("p", "detail__framing");
  framing.innerHTML = "<strong>This is a rendered proposal, not a mockup of an authoring tool.</strong> It shows the design and the rules it obeys — not how authors produce it. Controls describe <em>states of the content</em>, not actions an author takes. Pending feedback from WGU and OpenCraft.";
  header.appendChild(framing);
  detail.appendChild(header);

  // Workbench: rail | stage | spec
  const workbench = h("div", "workbench");

  // -- Rail (Content configuration + Inspector) --
  const rail = h("div", "rail");
  const cfg = h("div", "rail__section");
  cfg.appendChild(h("p", "rail__label", "Content configuration"));
  const groups = {};
  PRESETS.forEach((pr) => { (groups[pr.group] = groups[pr.group] || []).push(pr); });
  Object.keys(groups).forEach((g) => {
    const gEl = h("div", "preset-group");
    gEl.appendChild(h("div", "preset-group__name", g));
    groups[g].forEach((pr) => {
      const btn = h("button", "preset");
      btn.type = "button";
      btn.dataset.preset = pr.id;
      btn.setAttribute("aria-pressed", String(pr.id === state.presetId));
      btn.appendChild(h("span", "preset__name", pr.label));
      btn.addEventListener("click", () => { state.presetId = pr.id; refresh(); });
      gEl.appendChild(btn);
    });
    cfg.appendChild(gEl);
  });
  rail.appendChild(cfg);

  const insp = h("div", "rail__section");
  insp.appendChild(h("p", "rail__label", "Inspector"));
  insp.appendChild(toggle("Grid tracks + margin", () => state.grid, (v) => { state.grid = v; refresh(); }));
  insp.appendChild(toggle("Row boundaries", () => state.rows, (v) => { state.rows = v; refresh(); }));
  insp.appendChild(toggle("Measure guide", () => state.measure, (v) => { state.measure = v; refresh(); }));
  rail.appendChild(insp);
  workbench.appendChild(rail);

  // -- Stage --
  const stageWrap = h("div", "stage-wrap");
  const toolbar = h("div", "stage-toolbar");
  const widthReadout = h("span", "stage-toolbar__width mono", "stage: — px");
  const presetReadout = h("span", "stage-toolbar__preset", "");
  const stagePresets = h("div", "stage-presets");
  [["Mobile", 360], ["Tablet", 720], ["Wide", 900]].forEach(([label, px]) => {
    const b2 = h("button", null, label);
    b2.type = "button";
    b2.addEventListener("click", () => { stage.style.width = px + "px"; refresh(); });
    stagePresets.appendChild(b2);
  });
  toolbar.appendChild(widthReadout);
  toolbar.appendChild(presetReadout);
  toolbar.appendChild(h("span", "topbar__spacer"));
  toolbar.appendChild(stagePresets);
  stageWrap.appendChild(toolbar);

  const stage = h("div", "stage");
  const stageInner = h("div", "stage__inner");
  const overlay = h("div", "overlay");
  stageInner.appendChild(overlay);
  stage.appendChild(stageInner);
  stageWrap.appendChild(stage);
  workbench.appendChild(stageWrap);

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

  detail.appendChild(workbench);
  app.appendChild(detail);

  // ---- rendering pipeline ----
  let currentRows = [];
  const glyphPx = measureGlyph();

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

    renderSpec(specBody, currentRows, () => computeTriggers(currentRows, stageInner, glyphPx));
    layout();
  }

  function layout() {
    const trig = computeTriggers(currentRows, stageInner, glyphPx);
    // width readout: the container width the block actually sees
    const cw = containerWidth(stage);
    widthReadout.textContent = `stage: ${Math.round(cw)} px` + (trig.has("collapsed") ? "  · collapsed" : "  · wrap on");
    drawOverlays(overlay, stageInner, glyphPx, { grid: state.grid, measure: state.measure, rows: currentRows, trig });
    // re-highlight rules (triggers depend on live geometry)
    highlightRules(specBody, trig);
  }

  // live: react to the resizable frame
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  // fonts can change glyph metrics; recompute once ready
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => refresh());

  refresh();
}

/* ---- Deferred (Interactive) detail: same structure, scaffolded (§7) ---- */
function renderDeferredDetail(b) {
  const detail = h("div", "detail");
  const header = h("div", "detail__header");
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

/* The inline size the block's container query sees = stage content box. */
function containerWidth(stage) {
  const cs = getComputedStyle(stage);
  return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

/* Zone widths in ch, mirrored from flexible-content.css. Kept here as plain
 * numbers so the overlay maths is legible; the CSS is the source of truth. */
const ZONES = { leftTrack: 6, measure: 65, marginArea: 14, gutter: 3 };
const OVERLAP = { small: 12, medium: 15, large: 17 };

/* Is the desktop float layout active? Read it straight off a rendered aside —
 * getComputedStyle reflects the container-query result exactly. Falls back to
 * a width heuristic when there is no aside to sample. */
function isCollapsed(stageInner) {
  const aside = stageInner.querySelector(".wgu-block-flexible-content__aside");
  if (aside) return getComputedStyle(aside).float === "none";
  const stage = stageInner.closest(".stage");
  return containerWidth(stage) < 800; // 50rem threshold
}

function computeTriggers(rows, stageInner, glyphPx) {
  const t = new Set();
  const collapsed = isCollapsed(stageInner);
  if (collapsed) t.add("collapsed");

  const asideRows = rows.filter((r) => r.type === "--aside");
  if (asideRows.length) {
    t.add("aside");
    if (!collapsed) t.add("aside-desktop");
    asideRows.forEach((r) => {
      if (r.aside.kind === "image") t.add("image-aside");
      if (r.aside.kind === "callout") t.add("callout-aside");
      if (r.aside.size === "large") { /* floor candidate handled below */ }
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
    const narrow = ZONES.measure - ZONES.gutter - (OVERLAP[r.aside.size] || 15);
    minNarrow = Math.min(minNarrow, narrow);
  });
  if (isFinite(minNarrow)) {
    t.narrowCh = minNarrow;
    if (minNarrow <= 45) t.add("measure-floor");
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
function drawOverlays(overlay, stageInner, glyphPx, opts) {
  overlay.replaceChildren();
  const block = stageInner.querySelector(".wgu-block");
  if (!block) return;
  const innerRect = stageInner.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const x0 = blockRect.left - innerRect.left;   // block left within the overlay
  const collapsed = opts.trig.has("collapsed");

  // -- Grid tracks + margin --
  if (opts.grid && !collapsed) {
    const track = x0;
    const measure = x0 + ZONES.leftTrack * glyphPx;
    const margin = measure + ZONES.measure * glyphPx;
    zone(overlay, "track",   track,   ZONES.leftTrack * glyphPx, "left track · 7ch");
    zone(overlay, "measure", measure, ZONES.measure * glyphPx, "text column · 65ch");
    zone(overlay, "margin",  margin,  ZONES.marginArea * glyphPx, "margin · 15ch");
  } else if (opts.grid && collapsed) {
    const label = h("div", "overlay__zone-label", "collapsed — single column, no tracks");
    label.style.top = "4px"; label.style.left = x0 + "px"; label.style.position = "absolute";
    overlay.appendChild(label);
  }

  // -- Measure guide --
  if (opts.measure) {
    if (!collapsed) {
      const measureLeft = x0 + ZONES.leftTrack * glyphPx;
      // wide measure right edge (65ch)
      guide(overlay, measureLeft + ZONES.measure * glyphPx, `wide measure 65ch (≈${Math.round(ZONES.measure * glyphPx)}px)`, false);
      // narrow measure (if asides present)
      if (isFinite(opts.trig.narrowCh)) {
        const narrow = opts.trig.narrowCh;
        const x = measureLeft + narrow * glyphPx;
        const fail = narrow < 45;
        guide(overlay, x, `narrow measure ${narrow}ch ${fail ? "✕ below floor" : "✓ ≥ 45ch floor"}`, fail);
      }
    } else {
      // collapsed: text returns to full measure; show a single note
      const measureLeft = x0;
      guide(overlay, measureLeft + ZONES.measure * glyphPx, "collapsed — full measure, wrap off", false);
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
function renderSpec(body, rows, triggersFn) {
  body.replaceChildren();

  // Rules
  const s1 = h("div", "spec__section");
  s1.appendChild(h("h3", null, "Rules in this configuration"));
  RULES.forEach((r) => {
    const el = h("div", "rule");
    el.dataset.triggers = (r.triggers || []).join(",");
    if (r.always) el.dataset.always = "1";
    const head = h("div", "rule__head");
    head.appendChild(h("span", "rule__id mono", r.id));
    head.appendChild(h("span", "rule__title", r.title));
    el.appendChild(head);
    el.appendChild(h("p", null, r.body));
    el.querySelector("p").style.margin = "6px 0 0";
    s1.appendChild(el);
  });
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

  highlightRules(body, triggersFn());
}

function highlightRules(body, trig) {
  body.querySelectorAll(".rule").forEach((el) => {
    const keys = (el.dataset.triggers || "").split(",").filter(Boolean);
    const active = el.dataset.always === "1" || keys.some((k) => trig.has(k));
    el.classList.toggle("is-active", active);
  });
}

/* Boot */
route();
