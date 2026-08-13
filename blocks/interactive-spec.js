/* ============================================================================
 * interactive-spec.js — developer-facing spec panel for the Interactive Block.
 *
 * The state machine (§3) is the specification; here it renders as a live table
 * whose rows light up to show which transitions are available from the screen
 * the learner is currently on, plus a readout of the live state. Below it: the
 * rules, selection modes, author configuration, accessibility, and the open
 * questions with their assumed defaults.
 *
 * IIFE → window.ITV.renderSpecPanel(bodyEl) returns an update(snapshot) fn.
 * ==========================================================================*/
(function () {
  "use strict";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* Screen tokens used both by the engine snapshot and this table. */
  const screenLabel = { launch: "launch", "step-context": "step-context", "step-feedback": "step-feedback", synthesis: "synthesis" };
  const fromSnapshot = (s) => (s === "context" ? "step-context" : s === "feedback" ? "step-feedback" : s);

  const EDGES = [
    { from: ["launch"], trigger: "Launch button", to: "step-context (1)" },
    { from: ["step-context"], trigger: "Select any option", to: "step-feedback" },
    { from: ["step-feedback"], trigger: "Select another option — explore-all", to: "step-feedback (in place, no slide)" },
    { from: ["step-feedback"], trigger: "Select another option — choose-one", to: "— (locked, no effect)" },
    { from: ["step-feedback"], trigger: "Continue · gate satisfied · not last", to: "step-context (N+1)" },
    { from: ["step-feedback"], trigger: "Compare · gate satisfied · last step", to: "synthesis" },
    { from: ["step-feedback"], trigger: "Continue/Compare · gate not satisfied", to: "— (button disabled)" },
    { from: ["step-context", "step-feedback"], trigger: "Return (step indicator)", to: "step-feedback (N−1)" },
    { from: ["launch", "step-context", "step-feedback", "synthesis"], trigger: "Close / Escape", to: "launch" },
    { from: ["synthesis"], trigger: "Restart", to: "step-context (1), state cleared" },
    { from: ["synthesis"], trigger: "Exit", to: "launch" },
  ];

  const RULES = [
    ["R1", "Primary response = first option selected in a step. Identical in both modes; never changes afterwards."],
    ["R2", "Selecting an option marks it explored. Explored is permanent for the session."],
    ["R3", "The action button is disabled until the mode's gate is satisfied — the only gate on progression."],
    ["R4", "explore-all: every selection updates the feedback pane. choose-one: only the first selection has any effect."],
    ["R5", "Options show five distinct states: default, hover, focus, currently displayed, explored."],
    ["R6", "Maximum five steps, minimum one."],
    ["R7", "Only compare and record report per-step responses; minimal uses authored content only."],
  ];

  const MODES = [
    ["choose-one", "Select one option", "Satisfied by one selection", "Locked (read-only) after the first pick"],
    ["explore-all", "Select every option in turn", "Satisfied when all explored", "Remain selectable"],
  ];

  const AUTHORED = ["Number of steps (1–5)", "Options per step (may differ)", "Selection mode per step", "All text content", "Qualifier per option (+ custom label/icon)", "Response feedback per option", "Synthesis variant (one per interactive)", "Cover image"];
  const FIXED = ["Screen sequence & layout", "The transition model", "The all-explored gate", 'The label "What you need to do"', "Top bar structure", "Continue vs Compare (derived from step position)"];

  const A11Y = [
    'role="dialog" + aria-modal, labelled heading; focus moves in on open, returns to Launch on close',
    "Focus trapped while open; Escape closes; background inert and non-scrolling",
    "Options are real buttons, keyboard operable",
    'Disabled action button explains why, mode-specific ("Explore all options to continue — 2 of 4 explored")',
    "Locked options announced as unavailable, not just styled",
    "Feedback updates announced via a live region",
    "Qualifier meaning always carries a text label — never icon/colour alone",
    'Step indicator communicates position ("Step 2 of 4")',
  ];

  const QUESTIONS = [
    ["Q1a", "choose-one confirm step?", "No confirm — first click is final. (Alternative: select-then-confirm, safer but adds a click.)"],
    ["Q1b", "Keep exploring after the gate opens in explore-all?", "Yes — button enables, nothing locks; learner can keep reading feedback."],
    ["Q2", "Does every step open with its own context screen?", "Yes — step 2 begins at step-context; options move left→right between steps."],
    ["Q3", "Any scoring?", "No scoring, no LMS grade. Qualifiers are pedagogical labels only; the gate means no one can fail."],
    ["Q4", "Progress preserved on close?", "Yes for the session. Surviving a page reload depends on OpenedX storage — out of scope here."],
    ["Q5", "Does the slide survive on mobile?", "No — the sequence becomes vertical/quiet. Confirm against the mobile frames."],
    ["Q6", "Can qualifiers repeat within a step?", "Yes — nothing depends on uniqueness."],
  ];

  function section(body, title) { const s = el("div", "spec__section"); s.appendChild(el("h3", null, title)); body.appendChild(s); return s; }

  function renderSpecPanel(body) {
    body.replaceChildren();

    // ---- State machine (live) ----
    const s1 = section(body, "State machine");
    const readout = el("p", "itv-spec-readout");
    s1.appendChild(readout);
    const rows = [];
    const table = el("div", "itv-edges");
    EDGES.forEach((e) => {
      const row = el("div", "itv-edge");
      row.dataset.from = e.from.join(" ");
      row.appendChild(el("span", "itv-edge__from mono", e.from.join(" / ")));
      row.appendChild(el("span", "itv-edge__trig", e.trigger));
      row.appendChild(el("span", "itv-edge__to mono", "→ " + e.to));
      table.appendChild(row);
      rows.push(row);
    });
    s1.appendChild(table);

    // ---- Rules ----
    const s2 = section(body, "Rules");
    RULES.forEach(([id, txt]) => {
      const r = el("div", "rule");
      const head = el("div", "rule__head");
      head.appendChild(el("span", "rule__id mono", id));
      head.appendChild(el("span", "rule__title", txt));
      r.appendChild(head);
      s2.appendChild(r);
    });

    // ---- Selection modes ----
    const s3 = section(body, "Selection modes");
    MODES.forEach((m) => {
      const c = el("div", "itv-mode");
      c.appendChild(el("div", "itv-mode__name mono", m[0]));
      c.appendChild(el("div", "itv-mode__cell", m[1]));
      c.appendChild(el("div", "itv-mode__cell", "Gate: " + m[2]));
      c.appendChild(el("div", "itv-mode__cell", "After first: " + m[3]));
      s3.appendChild(c);
    });
    s3.appendChild(el("p", "itv-note", "Why choose-one locks: if the learner could change their answer after seeing feedback, they could click to the Correct qualifier without judgement, and the qualifier would report an accuracy that never happened. Locking is what makes the qualifier meaningful."));

    // ---- Author configuration ----
    const s4 = section(body, "Author configuration");
    const cols = el("div", "itv-cfg");
    const mk = (h, list) => { const d = el("div"); d.appendChild(el("div", "itv-cfg__h", h)); const ul = el("ul", "itv-cfg__list"); list.forEach((x) => ul.appendChild(el("li", null, x))); d.appendChild(ul); return d; };
    cols.appendChild(mk("Author controls", AUTHORED));
    cols.appendChild(mk("Fixed by the system", FIXED));
    s4.appendChild(cols);

    // ---- Accessibility ----
    const s5 = section(body, "Accessibility");
    const ul = el("ul", "itv-cfg__list");
    A11Y.forEach((x) => ul.appendChild(el("li", null, x)));
    s5.appendChild(ul);

    // ---- Open questions (assumed defaults) ----
    const s6 = section(body, "Open questions — assumed defaults");
    QUESTIONS.forEach(([id, q2, ans]) => {
      const d = el("div", "decision");
      d.appendChild(el("h4", null, `${id} · ${q2}`));
      const p = el("p", null, ans); p.style.margin = "0";
      d.appendChild(p);
      s6.appendChild(d);
    });

    // ---- live updater ----
    function update(snap) {
      const scr = fromSnapshot(snap.screen);
      const modeTxt = snap.mode ? ` · mode ${snap.mode}` : "";
      let gate = "";
      if (snap.screen === "feedback") {
        gate = snap.mode === "explore-all" ? ` · gate ${snap.exploredCount}/${snap.options}` : ` · gate ${snap.gate ? "satisfied" : "waiting"}`;
      }
      readout.innerHTML = `current screen <b class="mono">${screenLabel[scr] || scr}</b> · <b class="mono">Step ${snap.step + 1} of ${snap.totalSteps}</b>${modeTxt}${gate}`;
      rows.forEach((row) => {
        const avail = row.dataset.from.split(" ").includes(scr);
        row.classList.toggle("is-available", avail);
      });
    }
    return update;
  }

  window.ITV = Object.assign(window.ITV || {}, { renderSpecPanel });
})();
