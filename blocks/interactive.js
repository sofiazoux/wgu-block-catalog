/* ============================================================================
 * interactive.js — WGU Interactive Block: model, STATE MACHINE, live renderer,
 * and the named configurations.
 *
 * This block is not a static specimen: the stage renders a WORKING interactive
 * the audience can click through (launch → steps → feedback → synthesis). The
 * behaviour follows the behaviour-rules doc, which is the source of truth; the
 * (unavailable here) Figma frames are the source of truth for visual design, so
 * the visuals below are on-brand with the course tokens and meant to be
 * reconciled against the frames.
 *
 * Classic script, wrapped in an IIFE and exposed on window.ITV so its locals
 * never collide with the other blocks' globals. Loaded before app.js.
 * ==========================================================================*/
(function () {
  "use strict";

  const IB = "wgu-block-interactive";
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---- offline cover image (self-contained SVG data URI) ------------------ */
  function cover(hueA, hueB, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hueA},50%,52%)"/><stop offset="1" stop-color="hsl(${hueB},46%,34%)"/>
      </linearGradient></defs>
      <rect width="1200" height="900" fill="url(#g)"/>
      <circle cx="820" cy="300" r="150" fill="hsla(${hueA},70%,86%,0.85)"/>
      <text x="600" y="470" font-family="monospace" font-size="46" fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text>
    </svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  const COVER = cover(205, 220, "cover image");

  /* ---- qualifier vocabulary (§1). Meaning always carries a text label
   *      (a11y §8: never icon/colour alone). ---------------------------------*/
  const QUAL = {
    correct:   { label: "Correct", icon: "✓", tone: "correct" },
    incorrect: { label: "Incorrect", icon: "✕", tone: "incorrect" },
    best:      { label: "Best explanation", icon: "★", tone: "best" },
  };
  const qualOf = (q) => (typeof q === "string" ? (QUAL[q] || { label: q, icon: "●", tone: "custom" })
                                               : { label: q.label, icon: q.icon || "●", tone: "custom" });

  /* ========================================================================
   * ENGINE — createInteractive(config, opts) → { root, restart, focusLaunch }
   * opts.reducedMotion() : boolean   opts.onState(snapshot) : void
   * ======================================================================== */
  function createInteractive(config, opts) {
    opts = opts || {};
    const reduced = () => (opts.reducedMotion ? !!opts.reducedMotion() : false);
    const steps = config.steps;
    const lastIndex = steps.length - 1;

    const state = {
      screen: "launch",         // launch | context | feedback | synthesis
      step: 0,
      primary: {},              // stepIndex -> optionIndex (first selection, §R1)
      explored: {},             // stepIndex -> Set(optionIndex)
      displayed: {},            // stepIndex -> optionIndex currently shown in feedback
      lastEdge: null,           // { from, trigger, to } for the spec highlight
    };
    const exploredSet = (i) => (state.explored[i] || (state.explored[i] = new Set()));

    const root = el("div", `wgu-block ${IB}`);
    const viewport = el("div", `${IB}__viewport`);
    root.appendChild(viewport);

    let launchBtn = null;   // for focus return
    let lastFocus = null;   // element focused before modal opened

    /* ---- gate (§R3, §5.0) ------------------------------------------------- */
    function gateSatisfied(i) {
      const step = steps[i];
      if (step.mode === "choose-one") return state.primary[i] != null;
      return exploredSet(i).size === step.options.length; // explore-all
    }
    function exploredCount(i) { return exploredSet(i).size; }

    /* ---- snapshot for the inspector + spec highlight ---------------------- */
    function emit() {
      if (!opts.onState) return;
      opts.onState({
        screen: state.screen,
        step: state.step,
        totalSteps: steps.length,
        mode: steps[state.step] ? steps[state.step].mode : null,
        gate: state.screen === "feedback" ? gateSatisfied(state.step) : null,
        exploredCount: exploredCount(state.step),
        options: steps[state.step] ? steps[state.step].options.length : 0,
        primary: { ...state.primary },
        lastEdge: state.lastEdge,
        variant: config.synthesisVariant,
      });
    }

    /* ---- transitions ------------------------------------------------------ */
    function setEdge(from, trigger, to) { state.lastEdge = { from, trigger, to }; }

    function openModal() {
      lastFocus = document.activeElement;
      state.screen = "context";
      setEdge("launch", "Launch", "step-context");
      renderRoot();
      // focus moves into the dialog (§8)
      const dlg = viewport.querySelector(`.${IB}__modal`);
      if (dlg) (dlg.querySelector("h2, [tabindex], button") || dlg).focus();
      emit();
    }
    function closeModal(edgeFrom) {
      state.screen = "launch";
      setEdge(edgeFrom || "any modal screen", "Close / Escape", "launch");
      renderRoot();
      if (launchBtn) launchBtn.focus();   // focus returns to Launch (§8)
      emit();
    }
    function toScreen(screen, trigger, fromLabel, slide) {
      const prev = state.screen;
      state.screen = screen;
      setEdge(fromLabel || prev, trigger, screen === "context" ? "step-context" : screen === "feedback" ? "step-feedback" : "synthesis");
      renderModalBody(slide && !reduced());
      emit();
    }

    /* ---- learner actions -------------------------------------------------- */
    function selectOption(i, opt) {
      const step = steps[i];
      const ex = exploredSet(i);
      const first = state.primary[i] == null;

      if (step.mode === "choose-one") {
        if (!first) return;                 // locked after first (§R4, §5.0)
        state.primary[i] = opt;             // primary = only selection (§R1)
        ex.add(opt);
        state.displayed[i] = opt;
        toScreen("feedback", "Learner selects an option", "step-context", true);
        return;
      }
      // explore-all
      if (first) state.primary[i] = opt;    // primary = FIRST selection (§R1)
      ex.add(opt);                          // permanent (§R2)
      state.displayed[i] = opt;
      if (state.screen === "context") {
        toScreen("feedback", "Learner selects an option", "step-context", true);
      } else {
        // already in feedback → update pane in place, NO slide (§7, §R4)
        setEdge("step-feedback", "Learner selects another option (explore-all)", "step-feedback");
        renderModalBody(false);
        announce();
        emit();
      }
    }

    function advance() {
      if (!gateSatisfied(state.step)) return;  // the only gate (§R3)
      if (state.step === lastIndex) {
        toScreen("synthesis", "Compare (gate satisfied, last step)", "step-feedback", true);
      } else {
        state.step += 1;
        state.screen = "context";
        setEdge("step-feedback", "Continue (gate satisfied)", "step-context");
        renderModalBody(!reduced());
        emit();
      }
    }
    function goReturn() {
      if (state.screen === "synthesis") {         // synthesis → last step (§10)
        state.step = lastIndex;
        toScreen("feedback", "Return", "synthesis", true);
        return;
      }
      if (state.step === 0) return;               // step 1 has no return target (§3)
      state.step -= 1;                            // previous step's state preserved
      toScreen("feedback", "Return", "step-context / step-feedback", true);
    }
    function restart() {                          // §3 synthesis → step 1, cleared
      state.step = 0; state.primary = {}; state.explored = {}; state.displayed = {};
      state.screen = "context";
      setEdge("synthesis", "Restart", "step-context");
      renderRoot();
      const dlg = viewport.querySelector(`.${IB}__modal`);
      if (dlg) (dlg.querySelector("h2") || dlg).focus();
      emit();
    }

    /* ---- live region announcements (§8) ----------------------------------- */
    let liveEl = null;
    function announce() {
      if (!liveEl) return;
      const i = state.step, opt = state.displayed[i];
      const o = steps[i].options[opt];
      liveEl.textContent = `${qualOf(o.qualifier).label}. ${o.feedback}`;
    }

    /* ======================================================================
     * RENDERING
     * ==================================================================== */
    function renderRoot() {
      viewport.replaceChildren();
      viewport.appendChild(renderLaunch());
      if (state.screen !== "launch") {
        const modal = renderModal();
        viewport.appendChild(modal);
        renderModalBody(false);
      }
      // background inert while the dialog is open (§8)
      const launch = viewport.querySelector(`.${IB}__launch`);
      const open = state.screen !== "launch";
      launch.toggleAttribute("inert", open);
      launch.setAttribute("aria-hidden", String(open));
    }

    /* ---- launch (in page, not modal) (§4.1) ---- */
    function renderLaunch() {
      const wrap = el("div", `${IB}__launch`);
      const left = el("div", `${IB}__launch-main`);
      left.appendChild(el("p", `${IB}__eyebrow`, config.name));
      left.appendChild(el("h2", `${IB}__intent`, config.launch.intentTitle));
      left.appendChild(el("p", `${IB}__lead`, config.launch.contextParagraph));
      launchBtn = el("button", `${IB}__cta`, config.launch.launchLabel || "Launch");
      launchBtn.type = "button";
      launchBtn.addEventListener("click", openModal);
      left.appendChild(launchBtn);
      wrap.appendChild(left);

      const right = el("div", `${IB}__launch-cover`);
      if (config.cover !== null) {           // missing cover must not collapse (§10)
        const img = el("img"); img.src = config.cover || COVER; img.alt = "";
        right.appendChild(img);
      } else {
        right.classList.add("is-empty");
      }
      wrap.appendChild(right);
      return wrap;
    }

    /* ---- modal shell: persistent top bar + a body we re-render (§4.2) ---- */
    let bodyEl = null, stepIndEl = null, returnBtn = null;
    function renderModal() {
      const modal = el("div", `${IB}__modal`);
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", `${IB}-dlg-title`);
      modal.tabIndex = -1;

      const bar = el("div", `${IB}__bar`);           // NEVER animates (§4.2, §7)
      bar.appendChild(el("span", `${IB}__bar-name`, config.name));

      const ind = el("div", `${IB}__stepind`);
      returnBtn = el("button", `${IB}__return`, "‹ Return");
      returnBtn.type = "button";
      returnBtn.addEventListener("click", goReturn);
      ind.appendChild(returnBtn);
      stepIndEl = el("span", `${IB}__stepind-label`);
      ind.appendChild(stepIndEl);
      bar.appendChild(ind);

      const close = el("button", `${IB}__close`, "✕");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", () => closeModal("step-" + (state.screen === "context" ? "context" : "feedback")));
      bar.appendChild(close);
      modal.appendChild(bar);

      bodyEl = el("div", `${IB}__body`);
      modal.appendChild(bodyEl);

      liveEl = el("div", `${IB}__live`);
      liveEl.setAttribute("aria-live", "polite");
      modal.appendChild(liveEl);

      // focus trap + Escape (§8)
      modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
        if (e.key !== "Tab") return;
        const f = [...modal.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
          .filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      return modal;
    }

    function updateBar() {
      // Step indicator communicates position (§8). Return hidden on step 1 (§3).
      stepIndEl.textContent = `Step ${state.step + 1} of ${steps.length}`;
      const noReturn = state.step === 0 && state.screen !== "synthesis";
      returnBtn.hidden = noReturn;
    }

    function renderModalBody(slide) {
      if (!bodyEl) return;
      updateBar();
      let content;
      if (state.screen === "context") content = renderContext();
      else if (state.screen === "feedback") content = renderFeedback();
      else content = renderSynthesis();
      bodyEl.replaceChildren(content);
      if (slide) { content.classList.add(`${IB}__slide-in`); }
    }

    /* ---- step-context (§4.2) ---- */
    function renderContext() {
      const i = state.step, step = steps[i];
      const c = el("div", `${IB}__content`);
      const left = el("div", `${IB}__col ${IB}__col--text`);
      left.appendChild(el("h2", `${IB}__ctx-title`, step.contextTitle));
      left.querySelector("h2").id = `${IB}-dlg-title`;
      left.appendChild(el("p", `${IB}__ctx-desc`, step.contextDescription));
      left.appendChild(el("p", `${IB}__do-label`, "What you need to do")); // fixed label (§6)
      left.appendChild(el("p", `${IB}__task`, step.task));
      c.appendChild(left);

      const right = el("div", `${IB}__col ${IB}__col--options`);
      right.appendChild(el("p", `${IB}__restate`, step.taskRestatement));
      right.appendChild(renderOptions(i));   // nothing selected yet
      c.appendChild(right);
      return c;
    }

    /* ---- step-feedback (§4.3): options move to the left, feedback on right ---- */
    function renderFeedback() {
      const i = state.step, step = steps[i];
      const c = el("div", `${IB}__content`);
      const left = el("div", `${IB}__col ${IB}__col--options`);
      left.appendChild(el("p", `${IB}__restate`, step.taskRestatement));
      left.appendChild(renderOptions(i));
      left.appendChild(renderAction(i));
      c.appendChild(left);

      const right = el("div", `${IB}__col ${IB}__col--feedback`);
      const opt = state.displayed[i];
      const o = step.options[opt];
      const q = qualOf(o.qualifier);
      const qEl = el("div", `${IB}__qual ${IB}__qual--${q.tone}`);
      qEl.appendChild(el("span", `${IB}__qual-icon`, q.icon));
      qEl.appendChild(el("span", `${IB}__qual-label`, q.label));   // text label always (§8)
      right.appendChild(qEl);
      right.appendChild(el("p", `${IB}__feedback-text`, o.feedback));
      c.appendChild(right);
      return c;
    }

    function renderOptions(i) {
      const step = steps[i];
      const list = el("div", `${IB}__options`);
      list.setAttribute("role", "group");
      const locked = step.mode === "choose-one" && state.primary[i] != null;
      step.options.forEach((o, idx) => {
        const b = el("button", `${IB}__option`);
        b.type = "button";
        const explored = exploredSet(i).has(idx);
        const displayed = state.displayed[i] === idx && state.screen === "feedback";
        if (explored) b.classList.add("is-explored");
        if (displayed) { b.classList.add("is-displayed"); b.setAttribute("aria-current", "true"); }
        const lockedThis = locked && state.primary[i] !== idx;
        if (lockedThis) { b.setAttribute("aria-disabled", "true"); b.classList.add("is-locked"); }

        b.appendChild(el("span", `${IB}__option-text`, o.label));
        const badges = el("span", `${IB}__option-badges`);
        if (explored) badges.appendChild(srBadge("explored", "✓"));
        if (lockedThis) badges.appendChild(srBadge("unavailable", ""));  // announced (§8)
        b.appendChild(badges);

        b.addEventListener("click", () => {
          if (b.getAttribute("aria-disabled") === "true") return;   // locked read-only
          selectOption(i, idx);
        });
        list.appendChild(b);
      });
      return list;
    }
    function srBadge(text, icon) {
      const s = el("span", `${IB}__badge`);
      if (icon) s.appendChild(el("span", `${IB}__badge-icon`, icon));
      s.appendChild(el("span", "sr-only", " " + text));
      s.setAttribute("aria-label", text);
      return s;
    }

    function renderAction(i) {
      const wrap = el("div", `${IB}__action`);
      const last = i === lastIndex;
      const ok = gateSatisfied(i);
      const btn = el("button", `${IB}__action-btn`, last ? "Compare" : "Continue");
      btn.type = "button";
      btn.setAttribute("aria-disabled", String(!ok));            // focusable + explained (§8)
      const hintId = `${IB}-hint-${i}`;
      btn.setAttribute("aria-describedby", hintId);
      btn.addEventListener("click", () => { if (gateSatisfied(i)) advance(); });
      wrap.appendChild(btn);

      const hint = el("p", `${IB}__action-hint`);
      hint.id = hintId;
      if (!ok) {
        hint.textContent = steps[i].mode === "choose-one"
          ? "Select a response to continue"
          : `Explore all options to continue — ${exploredCount(i)} of ${steps[i].options.length} explored`;
      } else {
        hint.classList.add("is-ok");
        hint.textContent = last ? "Ready to compare" : "Ready to continue";
      }
      wrap.appendChild(hint);
      return wrap;
    }

    /* ---- synthesis (§4.4) ---- */
    function renderSynthesis() {
      const c = el("div", `${IB}__content ${IB}__content--synth`);
      const left = el("div", `${IB}__col ${IB}__synth-left`);
      const v = config.synthesisVariant;
      if (v === "compare") renderCompare(left);
      else if (v === "record") renderRecord(left);
      else renderMinimal(left);
      c.appendChild(left);

      // right column — identical across all three variants (§4.4)
      const right = el("div", `${IB}__col ${IB}__synth-right`);
      const s = config.synthesis;
      if (config.cover !== null) { const img = el("img", `${IB}__synth-cover`); img.src = config.cover || COVER; img.alt = ""; right.appendChild(img); }
      const card = el("div", `${IB}__takeaway`);
      card.appendChild(el("div", `${IB}__takeaway-icon`, "★"));
      card.appendChild(el("div", `${IB}__takeaway-title`, s.takeawayTitle));
      card.appendChild(el("p", `${IB}__takeaway-para`, s.takeawayPara));
      right.appendChild(card);
      const actions = el("div", `${IB}__synth-actions`);
      const restart = el("button", `${IB}__btn ${IB}__btn--ghost`, "Restart"); restart.type = "button"; restart.addEventListener("click", restart_);
      const exit = el("button", `${IB}__btn`, "Exit"); exit.type = "button"; exit.addEventListener("click", () => { setEdge("synthesis", "Exit", "launch"); closeModal("synthesis"); });
      actions.appendChild(restart); actions.appendChild(exit);
      right.appendChild(actions);
      c.appendChild(right);
      return c;
    }
    function restart_() { restart(); }

    function renderMinimal(left) {
      const s = config.synthesis.minimal;   // authored content only (§R7)
      const t1 = el("h2", `${IB}__synth-title`, s.conclusionTitle); t1.id = `${IB}-dlg-title`;
      left.appendChild(t1);
      left.appendChild(el("p", `${IB}__synth-para`, s.outcomePara));
      left.appendChild(el("h3", `${IB}__synth-sub`, s.additionalTitle));
      const ul = el("ul", `${IB}__synth-list`);
      s.bullets.forEach((b) => ul.appendChild(el("li", null, b)));
      left.appendChild(ul);
    }
    function renderCompare(left) {
      const s = config.synthesis.compare;
      const t = el("h2", `${IB}__synth-title`, s.title); t.id = `${IB}-dlg-title`;
      left.appendChild(t);
      left.appendChild(el("p", `${IB}__synth-para`, s.intro));
      const table = el("div", `${IB}__compare`);
      steps.forEach((step, i) => {                   // one row per step (§4.4)
        const row = el("div", `${IB}__compare-row`);
        const pIdx = state.primary[i];
        const primary = pIdx != null ? step.options[pIdx] : null;   // learner's primary response (§R1)
        row.appendChild(el("div", `${IB}__compare-primary`, primary ? primary.label : "—"));
        const rc = el("div", `${IB}__compare-fb`);
        if (primary) {
          const q = qualOf(primary.qualifier);
          const qi = el("span", `${IB}__qual ${IB}__qual--${q.tone} is-inline`);
          qi.appendChild(el("span", `${IB}__qual-icon`, q.icon));
          qi.appendChild(el("span", `${IB}__qual-label`, q.label));
          rc.appendChild(qi);
          rc.appendChild(el("p", null, primary.feedback));
        }
        row.appendChild(rc);
        table.appendChild(row);
      });
      left.appendChild(table);
    }
    function renderRecord(left) {
      const s = config.synthesis.record;
      const t = el("h2", `${IB}__synth-title`, s.title); t.id = `${IB}-dlg-title`;
      left.appendChild(t);
      left.appendChild(el("p", `${IB}__synth-para`, s.intro));
      const ol = el("ol", `${IB}__record`);
      steps.forEach((step, i) => {                   // ordered, one per step (§4.4)
        const li = el("li", `${IB}__record-item`);
        const pIdx = state.primary[i];
        const primary = pIdx != null ? step.options[pIdx] : null;
        li.appendChild(el("div", `${IB}__record-resp`, primary ? primary.label : "—"));
        if (primary) li.appendChild(el("p", `${IB}__record-fb`, primary.feedback));
        ol.appendChild(li);
      });
      left.appendChild(ol);
    }

    // initial paint
    renderRoot();
    emit();

    return { root, restart, focusLaunch: () => launchBtn && launchBtn.focus(), getState: () => state };
  }

  /* ========================================================================
   * NAMED CONFIGURATIONS (§8/§10) — happy path + edge cases.
   * ======================================================================== */
  const q = (label, qualifier, feedback) => ({ label, qualifier, feedback });
  const takeaway = {
    takeawayTitle: "Judgement beats recall",
    takeawayPara: "Behaviour has many causes at once; the skill is choosing which lens fits the situation in front of you.",
  };
  const synthAll = {
    takeawayTitle: takeaway.takeawayTitle, takeawayPara: takeaway.takeawayPara,
    minimal: {
      conclusionTitle: "There is no single cause",
      outcomePara: "Across these decisions you weighed situation against disposition — the balance shifts case by case.",
      additionalTitle: "Also worth keeping",
      bullets: ["Context is rarely neutral.", "A framework that fits a classroom may not fit a crowd.", "Judgement is built one case at a time."],
    },
    compare: { title: "How your responses compared", intro: "Each row is the response you reached for first, before feedback." },
    record: { title: "Your step-by-step recap", intro: "A record of the response you gave at each step." },
  };

  const step = (over) => Object.assign({
    mode: "choose-one",
    contextTitle: "A situation to read",
    contextDescription: "A learner is deciding how to act. Weigh what the moment demands against what the person tends to do.",
    task: "Choose the response that best reflects sound judgement in this situation.",
    taskRestatement: "Select the response you think is best",
    options: [
      q("Act on the situation's cues", "best", "Strong choice — you read the moment before defaulting to habit."),
      q("Rely on past experience", "incorrect", "Experience helps, but here the situation has changed in ways habit misses."),
      q("Wait for more information", "correct", "Reasonable — though at some point judgement under uncertainty is the task."),
    ],
  }, over);
  const exploreStep = (over) => step(Object.assign({
    mode: "explore-all",
    task: "Explore each response and the reasoning behind it.",
    taskRestatement: "Explore each response",
  }, over));

  const INTERACTIVE_PRESETS = [
    /* ---- Default + happy path ---- */
    {
      id: "choose-minimal", group: "Default", label: "Choose-one · minimal",
      description: "Two steps in choose-one mode; minimal synthesis. Options lock after the first pick.",
      config: { name: "What shapes behaviour?", cover: COVER, launch: { intentTitle: "Weigh situation against disposition", contextParagraph: "You will make two judgement calls, then see how your reasoning holds up. Choose the response you think is best — your first choice is what counts.", launchLabel: "Launch" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step(), step({ contextTitle: "A second situation" })] },
    },
    {
      id: "explore-compare", group: "Optional configuration", label: "Explore-all · compare",
      description: "Explore every option before continuing; compare synthesis reports your primary response per step.",
      config: { name: "Reading a situation", cover: COVER, launch: { intentTitle: "Explore every angle", contextParagraph: "For each step, explore all the responses and their feedback, then compare how they line up.", launchLabel: "Start exploring" }, synthesisVariant: "compare", synthesis: synthAll, steps: [exploreStep(), exploreStep({ contextTitle: "Another angle" })] },
    },
    {
      id: "mixed-record", group: "Optional configuration", label: "Mixed modes · record",
      description: "Step 1 asks for judgement (choose-one), step 2 for exploration (explore-all); record synthesis.",
      config: { name: "Judgement, then exploration", cover: COVER, launch: { intentTitle: "First decide, then explore", contextParagraph: "The first step asks for your best judgement. The second asks you to explore every response. The recap records what you did.", launchLabel: "Launch" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Now explore" })] },
    },
    {
      id: "record-3", group: "Optional configuration", label: "Three steps · record",
      description: "Three steps, record synthesis — the step-by-step recap.",
      config: { name: "Three decisions", cover: COVER, launch: { intentTitle: "Three decisions in a row", contextParagraph: "Work through three related decisions; the recap lists your response to each.", launchLabel: "Launch" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Second decision" }), step({ contextTitle: "Third decision" })] },
    },

    /* ---- Edge cases (§10) ---- */
    {
      id: "single-compare", group: "Edge cases", label: "Single step → Compare on step 1",
      description: "A one-step interactive: the action button reads Compare on step 1, and Return is hidden.",
      config: { name: "One decision", cover: COVER, launch: { intentTitle: "A single judgement", contextParagraph: "Just one step. The action button reads Compare, not Continue, because this is already the last step.", launchLabel: "Launch" }, synthesisVariant: "compare", synthesis: synthAll, steps: [step()] },
    },
    {
      id: "two-options", group: "Edge cases", label: "Step with two options",
      description: "Explore-all with only two options — the gate is satisfied quickly, which is correct.",
      config: { name: "A quick gate", cover: COVER, launch: { intentTitle: "Only two responses", contextParagraph: "With two options in explore-all, the gate opens after both are explored.", launchLabel: "Launch" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [exploreStep({ options: [q("Act on the cues", "best", "You read the moment first."), q("Fall back on habit", "incorrect", "Habit misses what has changed here.")] })] },
    },
    {
      id: "long-text", group: "Edge cases", label: "Long option / feedback text",
      description: "Long option labels and long feedback must wrap without breaking layout.",
      config: { name: "Wrapping under pressure", cover: COVER, launch: { intentTitle: "When the text runs long", contextParagraph: "Some authors write long options and long feedback. The layout has to hold — both wrap without breaking the two-column structure or the modal.", launchLabel: "Launch" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step({ options: [
        q("Read the situation carefully before acting, giving weight to the specific cues in front of you rather than defaulting to what usually works", "best", "A strong choice. Reading the situation first, before reaching for a habitual response, is exactly the judgement this step is testing — and it is a habit that transfers across very different settings, from a classroom to a negotiation to a decision made alone under real uncertainty."),
        q("Rely on the experience you have accumulated over many similar past situations", "incorrect", "Experience is valuable, but the trap here is that this situation only looks similar. The cues that matter have shifted, and a response tuned to the old pattern will miss them. This is the failure mode the step is designed to surface."),
        q("Pause and gather more information before committing to any single course of action", "correct", "Reasonable and often wise — though notice that at some point the task itself is to exercise judgement under uncertainty, because more information is not always available."),
      ] })] },
    },
    {
      id: "no-cover", group: "Edge cases", label: "Missing cover image",
      description: "No cover image supplied — the launch and synthesis layouts must not collapse.",
      config: { name: "No cover supplied", cover: null, launch: { intentTitle: "Layout holds without a cover", contextParagraph: "When no cover image is provided, the column reserves its space and the layout stays intact.", launchLabel: "Launch" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step()] },
    },
    {
      id: "five-steps", group: "Edge cases", label: "Five steps (maximum)",
      description: "The maximum of five steps (§R6). Return works across all of them.",
      config: { name: "The full length", cover: COVER, launch: { intentTitle: "Five decisions", contextParagraph: "Five steps is the maximum an interactive may have. Continue moves forward; Return moves back with state preserved.", launchLabel: "Launch" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Step two" }), step({ contextTitle: "Step three" }), exploreStep({ contextTitle: "Step four" }), step({ contextTitle: "Step five" })] },
    },
  ];
  const interactivePresetById = (id) => INTERACTIVE_PRESETS.find((x) => x.id === id) || INTERACTIVE_PRESETS[0];

  window.ITV = Object.assign(window.ITV || {}, {
    create: createInteractive,
    PRESETS: INTERACTIVE_PRESETS,
    presetById: interactivePresetById,
    qualOf,
  });
})();
