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
    status: "in-review",
    statusLabel: "In review",
    desc: "A clickable multi-step activity: launch, decision steps with feedback, and a synthesis. Behaviour-driven state machine.",
    ready: true,
    kind: "interactive",
  },
  {
    id: "flashcards",
    name: "Flashcards Block",
    status: "in-review",
    statusLabel: "Planning",
    desc: "A set of flip cards for recall practice. To be specified — behaviour, deck size, and progression still to define.",
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
  // Clean preview-mode flags between navigations.
  document.body.classList.remove("is-interactive-preview");
  app.classList.remove("preview-mode");

  const hash = location.hash.replace(/^#/, "") || "/";
  // Full-width preview of the interactive block: no chrome, just the block.
  const preview = hash.match(/^\/preview\/interactive\/([\w-]+)/);
  if (preview) { renderInteractivePreview(preview[1]); return; }
  // Full-width preview of a flashcards mockup screen (planning stage).
  const fcPreview = hash.match(/^\/preview\/flashcards\/([\w-]+)/);
  if (fcPreview) { renderFlashcardsPreview(fcPreview[1]); return; }
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
  prev.appendChild(!b.ready ? miniDeferredPreview() : b.kind === "interactive" ? miniInteractivePreview() : miniFlexiblePreview());
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

/* Interactive: a mini modal with an option list + a highlighted (selected) row. */
function miniInteractivePreview() {
  const w = h("div");
  w.innerHTML = `
    <div style="border:1px solid #e2e5e8;border-radius:6px;overflow:hidden;">
      <div style="height:16px;background:#223e5d;display:flex;align-items:center;padding:0 8px;">
        <div style="height:4px;width:40%;background:rgba(255,255,255,0.7);border-radius:2px;"></div>
      </div>
      <div style="padding:10px;display:flex;gap:8px;">
        <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
          <div style="height:14px;border:1.5px solid #d6d9df;border-radius:4px;"></div>
          <div style="height:14px;border:1.5px solid #0070f0;box-shadow:inset 0 0 0 1px #0070f0;border-radius:4px;"></div>
          <div style="height:14px;border:1.5px solid #d6d9df;border-radius:4px;"></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <div style="height:9px;width:52px;background:#0070f0;border-radius:999px;"></div>
          <div style="height:4px;width:100%;background:#e2e5e8;border-radius:2px;"></div>
          <div style="height:4px;width:86%;background:#e2e5e8;border-radius:2px;"></div>
        </div>
      </div>
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
  if (b.id === "flashcards") return renderFlashcardsDetail(b);
  if (!b.ready) return renderDeferredDetail(b);
  if (b.kind === "interactive") return renderInteractiveDetail(b);

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
  ph.textContent = `${b.name} — to be defined`;
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
 * FLASHCARDS BLOCK DETAIL — content-only render (no rail, no spec panel).
 * The stage takes the full workbench width, same shape as the Interactive
 * block's demo mode. Toolbar mirrors Interactive: px readout, Wide preset,
 * Preview button, drag handle. Content is the Figma Launch Screen mockup.
 * ==========================================================================*/
function renderFlashcardsDetail(b) {
  const detail = h("div", "detail");
  detail.classList.add("detail--flashcards-demo");
  const header = h("div", "detail__header");
  header.appendChild(backLink());
  const titleRow = h("div", "detail__title-row");
  titleRow.appendChild(h("h1", "detail__title", b.name));
  titleRow.appendChild(statusBadge(b.status, b.statusLabel));
  header.appendChild(titleRow);
  detail.appendChild(header);

  const workbench = h("div", "workbench");
  workbench.classList.add("workbench--flashcards-demo");

  // Stage — same rig as renderInteractiveDetail: px readout, Wide preset,
  // Preview button, and the drag handle on the right edge.
  const stageWrap = h("div", "stage-wrap");
  const toolbar = h("div", "stage-toolbar");
  const widthReadout = h("span", "readout");
  widthReadout.innerHTML = 'stage <b class="mono">—</b> px';
  const widthValue = widthReadout.querySelector("b");
  const caption = h("p", "stage-caption", "Launch Screen — first frame the learner sees before starting the deck.");

  const stagePresets = h("div", "stage-presets");
  const wideBtn = h("button", null, "Wide");
  wideBtn.type = "button";
  wideBtn.addEventListener("click", () => { stage.style.width = "980px"; updateWidth(); });
  stagePresets.appendChild(wideBtn);
  const previewBtn = h("button", "stage-presets__preview");
  previewBtn.type = "button";
  previewBtn.title = "Open a full-width preview of this screen in a new tab";
  previewBtn.innerHTML = 'Preview <span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span>';
  previewBtn.addEventListener("click", () => { window.open("#/preview/flashcards/launch", "_blank"); });
  stagePresets.appendChild(previewBtn);

  toolbar.appendChild(widthReadout);
  toolbar.appendChild(h("span", "stage-toolbar__spacer"));
  toolbar.appendChild(stagePresets);
  stageWrap.appendChild(toolbar);
  stageWrap.appendChild(caption);

  const stageFrame = h("div", "stage-frame");
  const stage = h("div", "stage");
  stage.style.width = "980px";                     // Wide default; expanded below
  const stageInner = h("div", "stage__inner");
  // In-stage screen swaps: launch → cards → outcome → (practice → outcome)*
  // → launch (via Exit). showCards takes a deck so the same swap serves both
  // a fresh full round and a Practice round with only the previously-missed
  // terms; identity check against FLASHCARDS_TERMS is how we tell them apart
  // for the caption.
  function swap(block) {
    stageInner.querySelectorAll(".wgu-block-flashcards").forEach((n) => n.remove());
    stageInner.appendChild(block);
  }
  function showLaunch() {
    swap(buildFlashcardsLaunch(() => showCards(FLASHCARDS_TERMS)));
    caption.textContent = "Launch Screen — first frame the learner sees before starting the deck.";
  }
  function showCards(deck) {
    swap(buildFlashcardsCards(deck, showOutcome));
    caption.textContent = deck === FLASHCARDS_TERMS
      ? "Default card state — front of the first card, before the learner reveals the definition."
      : "Practice round — a fresh pass through only the cards marked as missed.";
  }
  function showOutcome(session) {
    swap(buildFlashcardsOutcome(session, {
      onExit: showLaunch,
      onPractice: () => {
        // Build a new deck from THIS round's missed answers (session.deck is
        // the round's deck, so this works for both original + practice rounds).
        const missedDeck = session.answers
          .map((a, i) => a === "missed" ? session.deck[i] : null)
          .filter(Boolean);
        if (missedDeck.length) showCards(missedDeck);
      },
    }));
    caption.textContent = "Outcome screen — end-of-round recap with missed terms and next-step actions.";
  }
  showLaunch();
  stage.appendChild(stageInner);
  const handle = h("div", "stage__handle");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.title = "Drag to resize the stage";
  stageFrame.appendChild(stage); stageFrame.appendChild(handle);
  stageWrap.appendChild(stageFrame);
  workbench.appendChild(stageWrap);

  // Drag-to-resize (same pointer-events pattern as the other stages).
  let dx = 0, dw = 0;
  const dragMin = 320;
  const onMove = (e) => { stage.style.width = Math.max(dragMin, Math.min(2000, dw + (e.clientX - dx))) + "px"; updateWidth(); };
  const onUp = (e) => { try { handle.releasePointerCapture(e.pointerId); } catch (_) {} window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); handle.classList.remove("is-dragging"); };
  handle.addEventListener("pointerdown", (e) => { e.preventDefault(); dx = e.clientX; dw = stage.offsetWidth; try { handle.setPointerCapture(e.pointerId); } catch (_) {} handle.classList.add("is-dragging"); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); });

  detail.appendChild(workbench);
  app.appendChild(detail);

  function updateWidth() {
    const cs = getComputedStyle(stage);
    widthValue.textContent = Math.round(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  }
  const ro = new ResizeObserver(() => updateWidth());
  ro.observe(stage);
  updateWidth();

  // Fit the stage to whichever is smaller: the workbench width, or the width
  // that keeps the flashcards block (aspect 1280/832) within the viewport
  // height. Without the height cap, the block overflows on typical browsers
  // and forces the user to scroll to see the cards or the outcome. Recomputed
  // on window resize so the fit follows the viewport.
  function fitStageToViewport() {
    const frame = stage.parentElement;
    if (!frame) return;
    const hStyle = getComputedStyle(handle);
    const handleBox = handle.offsetWidth + parseFloat(hStyle.marginLeft) + parseFloat(hStyle.marginRight);
    const widthFromFrame = frame.clientWidth - handleBox - 2;
    const availableHeight = window.innerHeight - stageFrame.getBoundingClientRect().top - 24;
    const widthFromHeight = availableHeight * (1280 / 832);
    const target = Math.max(dragMin, Math.min(widthFromFrame, widthFromHeight));
    stage.style.width = target + "px";
    updateWidth();
  }
  requestAnimationFrame(fitStageToViewport);
  window.addEventListener("resize", fitStageToViewport);
}

/* Sample deck used by the card view. The data structure supports a full deck
 * of front/back pairs, but only the first term is rendered at this stage — the
 * flip and progression are the next step. Progress reads "1/10" (per the
 * Figma frame) rather than n/deck.length while the deck size is a placeholder. */
const FLASHCARDS_TERMS = [
  { term: "Self-esteem", definition: "The value a person places on themselves — how worthy they feel of respect, care, and success." },
  { term: "Motivation", definition: "The internal state that drives a person to act toward a goal — from curiosity, need, or reward." },
  { term: "Resilience", definition: "The capacity to recover from setbacks and adapt when things don't go as planned." },
  { term: "Growth mindset", definition: "The belief that abilities can be developed through effort, feedback, and practice." },
];

/* Launch Screen mockup markup — HTML skeleton matching the Figma frame. All
 * sizing is handled in blocks/flashcards.css via container queries so this
 * builder stays declarative. onLaunch (optional) is wired to the "Launch
 * Interactive" CTA so the caller can swap in the card view in-place. */
function buildFlashcardsLaunch(onLaunch) {
  const wrap = h("div", "wgu-block wgu-block-flashcards");
  wrap.innerHTML = `
    <div class="fc-launch">
      <div class="fc-launch__left">
        <div class="fc-launch__context">
          <div class="fc-launch__header">
            <span class="material-symbols-outlined fc-launch__icon" aria-hidden="true">dynamic_feed</span>
            <span class="fc-launch__divider" aria-hidden="true"></span>
            <p class="fc-launch__label">Flashcards</p>
          </div>
          <div class="fc-launch__content">
            <h2 class="fc-launch__title">Retrieval Practice</h2>
            <p class="fc-launch__desc"><strong>Hi! 👋</strong> Let's pause for a quick review. You'll see a term, try to remember what it means, before revealing the answer. Select whether you got it right or wrong, and practice the ones you missed.</p>
          </div>
        </div>
        <button class="fc-launch__cta" type="button">Launch Interactive</button>
      </div>
      <div class="fc-launch__right" aria-hidden="true"></div>
    </div>
  `;
  if (onLaunch) wrap.querySelector(".fc-launch__cta").addEventListener("click", onLaunch);
  return wrap;
}

/* Default card state + deck progression. Click the front to flip (CSS 3D) to
 * the back — term + definition + "How did you do?" + Missed it / Got it.
 * Answering swipes the current card off (Missed = left, Got = right; the
 * mid-point of the exit animation matches the Figma "Missed Card Animation"
 * frame) while the next deck term appears behind it in its default front
 * state, and the progress counter advances (1/N → 2/N → …).
 *
 * `deck` is the ordered list of term objects for this round — the full
 * FLASHCARDS_TERMS on a fresh session, or a filtered subset when the user
 * hits "Practice what you missed" on the outcome screen. It's stored on
 * session.deck so the outcome screen looks up terms from THIS round rather
 * than the original master list. Each answer is recorded on
 * wrap.__fcSession.answers; the caller-supplied onDeckDone gets the session
 * once the final card finishes exiting, and hands off to the outcome
 * screen. */
function buildFlashcardsCards(deck, onDeckDone) {
  const wrap = h("div", "wgu-block wgu-block-flashcards wgu-block-flashcards--cards");
  wrap.innerHTML = `
    <div class="fc-cards">
      <div class="fc-cards__topbar">
        <div class="fc-cards__brand">
          <span class="material-symbols-outlined fc-cards__brand-icon" aria-hidden="true">dynamic_feed</span>
          <span class="fc-cards__brand-divider" aria-hidden="true"></span>
          <p class="fc-cards__brand-label">Flashcards</p>
        </div>
        <button class="fc-cards__close" type="button" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="fc-cards__stage">
        <div class="fc-cards__stack"></div>
      </div>
      <p class="fc-cards__progress">1/${deck.length}</p>
    </div>
  `;

  const stack = wrap.querySelector(".fc-cards__stack");
  const progress = wrap.querySelector(".fc-cards__progress");

  // Session state — attached to the wrap so the outcome screen (and any
  // downstream consumer) can read it. answers[i] is "missed" | "got" for the
  // i-th card in THIS round's deck (which may be a filtered subset from a
  // Practice round). session.deck is that deck, so the outcome can resolve
  // missed indices back to their term objects without knowing about the
  // master list.
  const session = { index: 0, answers: [], deck };
  wrap.__fcSession = session;

  const EXIT_MS = 850;

  // Slots: [back, middle, front]. Every card in the deck is a full card
  // (front + back faces + handlers); its position, size, colour, and
  // interactivity are gated by the slot class the CSS applies. On each answer
  // the front-slot card exits, the two behind promote up a slot, and a fresh
  // card enters at the back — real "deck consumption" instead of the static
  // decorative layers we had before. Entries stay null when the deck runs
  // shorter than 3 remaining cards (last two answers of any round).
  const cards = [null, null, null];

  function setSlot(card, slot) {
    card.classList.remove(
      "fc-cards__card--slot-back",
      "fc-cards__card--slot-middle",
      "fc-cards__card--slot-front"
    );
    if (slot) {
      card.classList.add(`fc-cards__card--slot-${slot}`);
      card.setAttribute("tabindex", slot === "front" ? "0" : "-1");
    } else {
      card.removeAttribute("tabindex");
    }
  }

  function makeCard(term) {
    const card = h("div", "fc-cards__card");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Reveal the definition");
    card.innerHTML = `
      <div class="fc-cards__card-inner">
        <div class="fc-cards__card-face fc-cards__card-face--front">
          <span class="material-symbols-outlined fc-cards__flip-icon" aria-hidden="true">360</span>
          <p class="fc-cards__term">${term.term}</p>
          <div class="fc-cards__reveal">
            <span class="material-symbols-outlined fc-cards__reveal-icon" aria-hidden="true">mouse</span>
            <span class="fc-cards__reveal-text">Click to reveal</span>
          </div>
        </div>
        <div class="fc-cards__card-face fc-cards__card-face--back" aria-hidden="true">
          <span class="material-symbols-outlined fc-cards__flip-icon" aria-hidden="true">360</span>
          <div class="fc-cards__back-body">
            <h3 class="fc-cards__back-term">${term.term}</h3>
            <p class="fc-cards__back-definition">${term.definition}</p>
          </div>
          <p class="fc-cards__back-prompt">How did you do?</p>
          <div class="fc-cards__actions">
            <button class="fc-cards__action fc-cards__action--missed" type="button" aria-label="Missed it"></button>
            <button class="fc-cards__action fc-cards__action--got" type="button" aria-label="Got it"></button>
            <span class="fc-cards__action-label fc-cards__action-label--missed" aria-hidden="true">
              <span class="material-symbols-outlined">arrow_back</span>
              <span>Missed it</span>
            </span>
            <span class="fc-cards__action-label fc-cards__action-label--got" aria-hidden="true">
              <span>Got it</span>
              <span class="material-symbols-outlined">arrow_forward</span>
            </span>
          </div>
        </div>
      </div>
    `;

    const front = card.querySelector(".fc-cards__card-face--front");
    const back = card.querySelector(".fc-cards__card-face--back");

    const flip = () => {
      if (card.classList.contains("is-flipped")) return;
      card.classList.add("is-flipped");
      card.setAttribute("tabindex", "-1");
      card.setAttribute("aria-label", "Definition revealed — choose Missed it or Got it.");
      front.setAttribute("aria-hidden", "true");
      back.setAttribute("aria-hidden", "false");
    };
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
    card.querySelectorAll(".fc-cards__action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Only the current front-slot card answers. Non-front cards already
        // have pointer-events: none via CSS, but this is a belt-and-suspenders
        // guard so a still-attached exiting card can't answer a second time.
        if (card !== cards[2]) return;
        if (card.classList.contains("is-exiting")) return;
        const direction = btn.classList.contains("fc-cards__action--missed") ? "missed" : "got";
        answerCurrent(direction);
      });
    });

    return card;
  }

  function answerCurrent(direction) {
    const exitingCard = cards[2];
    if (!exitingCard) return;

    session.answers[session.index] = direction;
    session.index += 1;

    // Fire the exit animation on the current front card. It keeps its
    // slot-front dimensions (width/height/top/bg) so nothing shifts under it
    // — the exit animation only touches transform + opacity via keyframes.
    exitingCard.classList.add("is-exiting");
    exitingCard.classList.add(direction === "missed" ? "fc-cards__card--exit-left" : "fc-cards__card--exit-right");
    setTimeout(() => exitingCard.remove(), EXIT_MS);

    // Promote the two layers behind up a slot. CSS transitions on width,
    // height, top and background-color take care of the visual growth; the
    // inner content fades in as slot-middle → slot-front removes its opacity
    // gate.
    const newFront = cards[1];
    const newMiddle = cards[0];
    if (newFront) setSlot(newFront, "front");
    if (newMiddle) setSlot(newMiddle, "middle");
    cards[2] = newFront;
    cards[1] = newMiddle;
    cards[0] = null;

    // Add a fresh card at the back if the deck has one that far ahead.
    // (session.index has already been bumped, so +2 is the term two ahead
    // of the new front.)
    const newBackTermIndex = session.index + 2;
    if (newBackTermIndex < deck.length) {
      const newBack = makeCard(deck[newBackTermIndex]);
      setSlot(newBack, "back");
      stack.appendChild(newBack);
      cards[0] = newBack;
    }

    if (cards[2]) {
      progress.textContent = `${session.index + 1}/${deck.length}`;
    } else if (onDeckDone) {
      // No card left in the front slot — this was the last answer of the
      // round. Hand off to the outcome screen once the exit finishes.
      setTimeout(() => onDeckDone(session), EXIT_MS);
    }
  }

  // Initial mount: fill up to three slots with the first three terms.
  // slotIdx 2 = front (term[index]), 1 = middle (term[index+1]),
  // 0 = back (term[index+2]). Any that go past deck.length stay null.
  for (let slotIdx = 2; slotIdx >= 0; slotIdx--) {
    const termIndex = session.index + (2 - slotIdx);
    if (termIndex < deck.length) {
      const card = makeCard(deck[termIndex]);
      setSlot(card, ["back", "middle", "front"][slotIdx]);
      stack.appendChild(card);
      cards[slotIdx] = card;
    }
  }
  return wrap;
}

/* Outcome screen — end-of-deck summary for the ROUND that just finished.
 * Reads session.answers + session.deck to compute got/missed counts and to
 * resolve missed indices back to term objects (so a Practice round shows the
 * subset it was actually run against, not the master list). Exposes two
 * actions: Practice what you missed (onPractice — the caller wires this to a
 * fresh round with only the missed terms) and Exit (onExit — typically the
 * launch-screen swap). When there are no misses, the missed section, the
 * motivational note, and the Practice button all drop out. */
function buildFlashcardsOutcome(session, { onExit, onPractice = () => {} } = {}) {
  const deck = (session && session.deck) ? session.deck : FLASHCARDS_TERMS;
  const answers = (session && session.answers) ? session.answers : [];
  const total = deck.length;
  const missedIndices = answers.reduce((acc, a, i) => { if (a === "missed") acc.push(i); return acc; }, []);
  const gotCount = answers.filter((a) => a === "got").length;
  const missedCount = missedIndices.length;

  const missedItemsHtml = missedIndices.map((i) => {
    const t = deck[i];
    return `
      <div class="fc-outcome__missed-item">
        <p class="fc-outcome__missed-term">${t.term}</p>
        <p class="fc-outcome__missed-def">${t.definition}</p>
      </div>`;
  }).join("");

  const missedSectionHtml = missedCount > 0 ? `
    <div class="fc-outcome__missed">
      <p class="fc-outcome__missed-heading">Here are the ones you marked as missed:</p>
      <div class="fc-outcome__missed-list">${missedItemsHtml}</div>
    </div>` : "";

  const noteHtml = missedCount > 0
    ? `<p class="fc-outcome__note">Another quick pass in those ${missedCount} is all it takes</p>`
    : "";

  // Practice makes no sense with zero misses — hide the button entirely so
  // it can't leave the user on a dead-end action.
  const practiceHtml = missedCount > 0 ? `
    <button type="button" class="fc-outcome__practice">
      <span>Practice what you missed</span>
      <span class="material-symbols-outlined" aria-hidden="true">replay</span>
    </button>` : "";

  const wrap = h("div", "wgu-block wgu-block-flashcards wgu-block-flashcards--outcome");
  wrap.innerHTML = `
    <div class="fc-outcome">
      <div class="fc-cards__topbar">
        <div class="fc-cards__brand">
          <span class="material-symbols-outlined fc-cards__brand-icon" aria-hidden="true">dynamic_feed</span>
          <span class="fc-cards__brand-divider" aria-hidden="true"></span>
          <p class="fc-cards__brand-label">Flashcards</p>
        </div>
        <button class="fc-cards__close" type="button" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="fc-outcome__hero">
        <span class="material-symbols-outlined fc-outcome__hero-icon" aria-hidden="true">auto_graph</span>
        <p class="fc-outcome__score">${gotCount}/${total}</p>
        <div class="fc-outcome__hero-text">
          <h2 class="fc-outcome__headline">Well done! You recalled ${gotCount} out of ${total} from memory</h2>
          ${noteHtml}
        </div>
        ${practiceHtml}
      </div>
      ${missedSectionHtml}
      <button type="button" class="fc-outcome__exit">
        <span>Exit</span>
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
  `;

  const practiceBtn = wrap.querySelector(".fc-outcome__practice");
  if (practiceBtn) practiceBtn.addEventListener("click", onPractice);
  wrap.querySelector(".fc-outcome__exit").addEventListener("click", () => { if (onExit) onExit(); });
  return wrap;
}

/* Full-width preview of a flashcards mockup screen — no catalog chrome, just
 * the block filling the browser. Mirrors renderInteractivePreview but for the
 * planning-stage mockup screens. Currently only "launch" is defined. */
function renderFlashcardsPreview(screen) {
  document.body.classList.add("is-interactive-preview");   // reuse preview shell styles
  app.replaceChildren();
  app.classList.add("preview-mode");
  const stage = h("div", "preview-stage");
  // Same launch → cards → outcome → launch flow as the detail view, in-place
  // so the preview exercises the whole interaction without a page or URL
  // change. `screen` is currently ignored — the flow always starts at launch.
  function swap(block) {
    stage.querySelectorAll(".wgu-block-flashcards").forEach((n) => n.remove());
    stage.appendChild(block);
  }
  function showLaunch() { swap(buildFlashcardsLaunch(() => showCards(FLASHCARDS_TERMS))); }
  function showCards(deck) { swap(buildFlashcardsCards(deck, showOutcome)); }
  function showOutcome(session) {
    swap(buildFlashcardsOutcome(session, {
      onExit: showLaunch,
      onPractice: () => {
        const missedDeck = session.answers
          .map((a, i) => a === "missed" ? session.deck[i] : null)
          .filter(Boolean);
        if (missedDeck.length) showCards(missedDeck);
      },
    }));
  }
  showLaunch();
  app.appendChild(stage);
}

/* ============================================================================
 * INTERACTIVE BLOCK DETAIL — reuses the chrome (rail, stage + resizer, spec
 * panel). The stage hosts a WORKING interactive; the spec panel shows the live
 * state machine. Behaviour + data come from window.ITV (interactive.js).
 * ==========================================================================*/
function renderInteractiveDetail(b) {
  const ITV = window.ITV;
  // Client-demo mode: while the rail (content configuration) and spec panel
  // are not client-ready, we hide them and load a preset that showcases the
  // full flow (compare synthesis). Flip to false to bring the workbench UI
  // back once those panels are ready to share.
  const DEMO_MODE = true;
  const defaultPresetId = DEMO_MODE ? "explore-compare" : ITV.PRESETS[0].id;
  const state = { presetId: defaultPresetId, currentState: false, reducedMotion: false };

  const detail = h("div", "detail");
  if (DEMO_MODE) detail.classList.add("detail--interactive-demo");
  const header = h("div", "detail__header");
  header.appendChild(backLink());
  const titleRow = h("div", "detail__title-row");
  titleRow.appendChild(h("h1", "detail__title", b.name));
  titleRow.appendChild(statusBadge(b.status, b.statusLabel));
  header.appendChild(titleRow);
  detail.appendChild(header);

  const workbench = h("div", "workbench");
  if (DEMO_MODE) workbench.classList.add("workbench--interactive-demo");

  // -- Rail --
  const rail = h("div", "rail");
  const groupsInOrder = ["Default", "Optional configuration", "Edge cases"];
  const inGroup = (g) => ITV.PRESETS.filter((p) => p.group === g);
  const presetBtn = (pr) => {
    const btn = h("button", "preset");
    btn.type = "button"; btn.dataset.preset = pr.id; btn.title = pr.label;
    btn.setAttribute("aria-pressed", String(pr.id === state.presetId));
    btn.appendChild(h("span", "preset__name", pr.label));
    btn.addEventListener("click", () => { state.presetId = pr.id; mount(); reflect(); });
    return btn;
  };
  const groupEl = (name, list) => {
    const g = h("div", "preset-group");
    if (name) g.appendChild(h("div", "preset-group__name", name));
    list.forEach((pr) => g.appendChild(presetBtn(pr)));
    return g;
  };

  const cfg = h("div", "rail__section");
  cfg.appendChild(h("p", "rail__label", "Content configuration"));
  cfg.appendChild(groupEl(null, inGroup("Default")));
  cfg.appendChild(groupEl("Optional configuration", inGroup("Optional configuration")));
  rail.appendChild(cfg);

  const insp = h("div", "rail__section");
  insp.appendChild(h("p", "rail__label", "Inspector"));
  insp.appendChild(toggle("Current state", () => state.currentState, (v) => { state.currentState = v; stateView.classList.toggle("is-on", v); }));
  insp.appendChild(toggle("Reduced motion", () => state.reducedMotion, (v) => { state.reducedMotion = v; }));
  rail.appendChild(insp);

  const edge = h("div", "rail__section");
  edge.appendChild(h("p", "rail__label", "Edge cases"));
  edge.appendChild(groupEl(null, inGroup("Edge cases")));
  rail.appendChild(edge);
  workbench.appendChild(rail);

  // -- Stage --
  const stageWrap = h("div", "stage-wrap");
  const toolbar = h("div", "stage-toolbar");
  const widthReadout = h("span", "readout");
  widthReadout.innerHTML = 'stage <b class="mono">—</b> px';
  const widthValue = widthReadout.querySelector("b");
  const caption = h("p", "stage-caption", "");
  const stagePresets = h("div", "stage-presets");
  // Demo mode only shows the Wide preset since Mobile/Tablet layouts aren't
  // ready to share yet.
  const presetSizes = DEMO_MODE
    ? [["Wide", 980]]
    : [["Mobile", 360], ["Tablet", 760], ["Wide", 980]];
  presetSizes.forEach(([label, px]) => {
    const bb = h("button", null, label); bb.type = "button";
    bb.addEventListener("click", () => { stage.style.width = px + "px"; updateWidth(); });
    stagePresets.appendChild(bb);
  });
  // Preview: open the current preset full-window in a new tab, no catalog
  // chrome — approximates what the block looks like in real use.
  const previewBtn = h("button", "stage-presets__preview");
  previewBtn.type = "button";
  previewBtn.title = "Open a full-width preview of this preset in a new tab";
  previewBtn.innerHTML = 'Preview <span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span>';
  previewBtn.addEventListener("click", () => {
    window.open("#/preview/interactive/" + state.presetId, "_blank");
  });
  stagePresets.appendChild(previewBtn);
  toolbar.appendChild(widthReadout);
  toolbar.appendChild(h("span", "stage-toolbar__spacer"));
  toolbar.appendChild(stagePresets);
  stageWrap.appendChild(toolbar);
  stageWrap.appendChild(caption);

  const stageFrame = h("div", "stage-frame");
  const stage = h("div", "stage");
  stage.style.width = "980px";                     // load in Wide by default
  const stageInner = h("div", "stage__inner");
  const stateView = h("div", "itv-stateview");     // "Current state" overlay
  stageInner.appendChild(stateView);
  stage.appendChild(stageInner);
  const handle = h("div", "stage__handle");
  handle.setAttribute("role", "separator"); handle.setAttribute("aria-orientation", "vertical");
  handle.title = "Drag to resize the stage";
  stageFrame.appendChild(stage); stageFrame.appendChild(handle);
  stageWrap.appendChild(stageFrame);
  workbench.appendChild(stageWrap);

  // drag-to-resize (same pattern as the flexible detail)
  let dx = 0, dw = 0;
  const dragMin = DEMO_MODE ? 320 : 280;
  const onMove = (e) => { stage.style.width = Math.max(dragMin, Math.min(2000, dw + (e.clientX - dx))) + "px"; updateWidth(); };
  const onUp = (e) => { try { handle.releasePointerCapture(e.pointerId); } catch (_) {} window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); handle.classList.remove("is-dragging"); };
  handle.addEventListener("pointerdown", (e) => { e.preventDefault(); dx = e.clientX; dw = stage.offsetWidth; try { handle.setPointerCapture(e.pointerId); } catch (_) {} handle.classList.add("is-dragging"); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); });

  // -- Spec panel --
  const spec = h("div", "spec");
  const specBar = h("div", "spec__bar");
  specBar.appendChild(h("h2", null, "Specification"));
  const collapseBtn = h("button", "spec__collapse", "⟨");
  collapseBtn.type = "button"; collapseBtn.title = "Collapse / expand the spec panel";
  let specCollapsed = true;
  collapseBtn.addEventListener("click", () => {
    specCollapsed = !specCollapsed;
    workbench.classList.toggle("is-spec-collapsed", specCollapsed);
    spec.classList.toggle("is-spec-collapsed", specCollapsed);
    collapseBtn.textContent = specCollapsed ? "⟨" : "⟩";
  });
  specBar.appendChild(collapseBtn);
  spec.appendChild(specBar);
  const specBody = h("div", "spec__body");
  spec.appendChild(specBody);
  workbench.appendChild(spec);
  workbench.classList.add("is-spec-collapsed");
  spec.classList.add("is-spec-collapsed");

  detail.appendChild(workbench);
  app.appendChild(detail);

  const specUpdate = ITV.renderSpecPanel(specBody);

  // ---- mount / update ----
  function reflect() {
    rail.querySelectorAll(".preset").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.preset === state.presetId)));
  }
  function updateWidth() {
    const cs = getComputedStyle(stage);
    widthValue.textContent = Math.round(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  }
  function onState(snap) {
    specUpdate(snap);
    renderStateView(stateView, snap);
  }
  function mount() {
    const pr = ITV.presetById(state.presetId);
    caption.textContent = pr.description;
    stageInner.querySelectorAll("." + "wgu-block-interactive").forEach((n) => n.remove());
    const inst = ITV.create(pr.config, { reducedMotion: () => state.reducedMotion, onState });
    stageInner.appendChild(inst.root);
  }

  const ro = new ResizeObserver(() => updateWidth());
  ro.observe(stage);
  mount();
  reflect();
  updateWidth();

  // In demo mode, expand the stage to the maximum available width in the
  // workbench on load — the "Wide" preset (980px) is a floor cap for wider
  // browsers, but on smaller screens we still fill what's available. Runs
  // after layout is settled so measurements are correct.
  if (DEMO_MODE) {
    requestAnimationFrame(() => {
      const frame = stage.parentElement;                 // .stage-frame
      if (!frame) return;
      const hStyle = getComputedStyle(handle);
      const handleBox = handle.offsetWidth
        + parseFloat(hStyle.marginLeft) + parseFloat(hStyle.marginRight);
      const target = Math.max(dragMin, frame.clientWidth - handleBox - 2);
      stage.style.width = target + "px";
      updateWidth();
    });
  }
}

/* ============================================================================
 * INTERACTIVE PREVIEW — the block on its own, no catalog chrome. Used from the
 * "Preview ↗" button so we can share what the block feels like at full-width.
 * ==========================================================================*/
function renderInteractivePreview(presetId) {
  const ITV = window.ITV;
  const preset = ITV.presetById(presetId);
  if (!preset) { renderCatalog(); return; }

  document.body.classList.add("is-interactive-preview");
  app.replaceChildren();
  app.classList.add("preview-mode");

  const stage = h("div", "preview-stage");
  const inst = ITV.create(preset.config, { reducedMotion: () => false });
  stage.appendChild(inst.root);
  app.appendChild(stage);
}

/* The "Current state" inspector overlay for the interactive stage. */
function renderStateView(view, snap) {
  const screen = snap.screen === "context" ? "step-context" : snap.screen === "feedback" ? "step-feedback" : snap.screen;
  const primaries = Object.keys(snap.primary).length
    ? Object.entries(snap.primary).map(([s, o]) => `s${Number(s) + 1}→opt${o + 1}`).join("  ")
    : "—";
  let gate = "—";
  if (snap.screen === "feedback") gate = snap.mode === "explore-all" ? `${snap.exploredCount}/${snap.options}` : (snap.gate ? "satisfied" : "waiting");
  view.replaceChildren();
  const row = (k, v) => { const r = h("div", "itv-stateview__row"); r.appendChild(h("span", "itv-stateview__k", k)); r.appendChild(h("span", "itv-stateview__v mono", v)); view.appendChild(r); };
  row("screen", screen);
  row("step", `${snap.step + 1} / ${snap.totalSteps}`);
  row("mode", snap.mode || "—");
  row("gate", gate);
  row("primary", primaries);
  row("variant", snap.variant);
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
