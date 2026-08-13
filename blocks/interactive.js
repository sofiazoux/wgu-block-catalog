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

  /* ---- Google Material Symbols (Outlined) — icons via <span class="…">name…</span>.
   * The webfont is loaded in index.html with FILL=0 (outlined). Container CSS
   * controls the font-size (and thus the icon size); color inherits. --------*/
  const ico = (name) => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
  const SVG_ARROW_OUTWARD    = ico("arrow_outward");
  const SVG_ARROW_FORWARD    = ico("arrow_forward");
  const SVG_REPLAY           = ico("replay");
  const SVG_CLOSE            = ico("close");
  const SVG_KEYBOARD_RETURN  = ico("keyboard_return");
  const SVG_CHECK_CIRCLE     = ico("check_circle");
  const SVG_CANCEL           = ico("cancel");
  const SVG_STAR             = ico("star");
  const SVG_INFO             = ico("info");
  const SVG_PUSH_PIN         = ico("push_pin");

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
  const COVER = "assets/interactive-cover.png";     // real illustration (author-provided)

  /* ---- qualifier vocabulary (§1). Meaning always carries a text label
   *      (a11y §8: never icon/colour alone). ---------------------------------*/
  const QUAL = {
    correct:   { label: "Correct",          icon: "✓", svg: SVG_CHECK_CIRCLE, tone: "correct" },
    incorrect: { label: "Incorrect",        icon: "✕", svg: SVG_CANCEL,       tone: "incorrect" },
    best:      { label: "Best explanation", icon: "★", svg: SVG_STAR,         tone: "best" },
  };
  const qualOf = (q) => (typeof q === "string" ? (QUAL[q] || { label: q, icon: "●", svg: SVG_INFO, tone: "custom" })
                                               : { label: q.label, icon: q.icon || "●", svg: q.svg || SVG_INFO, tone: "custom" });

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
        flipOptionsFrom = bodyEl.querySelector(`.${IB}__step-body`);   // shared element
        toScreen("feedback", "Learner selects an option", "step-context", false);
        return;
      }
      // explore-all
      if (first) state.primary[i] = opt;    // primary = FIRST selection (§R1)
      ex.add(opt);                          // permanent (§R2)
      state.displayed[i] = opt;
      if (state.screen === "context") {
        flipOptionsFrom = bodyEl.querySelector(`.${IB}__step-body`);   // shared element
        toScreen("feedback", "Learner selects an option", "step-context", false);
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
        pulseIncoming = true;                   // colour flash on the entering content
        renderModalBody(!reduced());
        emit();
      }
    }
    // Flag consumed by renderModalBody to apply the entering-content tint pulse
    // only on step-advance transitions (not on select / return / restart / etc).
    let pulseIncoming = false;
    // Reference to the options element captured before a context↔feedback
    // transition, so renderModalBody can FLIP it into its new position instead
    // of sliding the whole screen.
    let flipOptionsFrom = null;
    // Direction the "new" (non-options) column slides in from during a
    // shared-element transition: "left" (Return → context frame from left)
    // or "right" (Select → feedback pane from right). Null for no slide.
    let flipEnterSide = null;
    function goReturn() {
      // From synthesis: back to the last step's feedback (§10, state preserved).
      if (state.screen === "synthesis") {
        state.step = lastIndex;
        toScreen("feedback", "Return", "synthesis", true);
        return;
      }
      // From step-feedback: back to the same step's context so the learner can
      // re-read the framing before choosing again (state preserved). The
      // options element is FLIP'd from its feedback-left position back to the
      // context-right position, and the context-frame column slides in from
      // the left instead of just appearing.
      if (state.screen === "feedback") {
        flipOptionsFrom = bodyEl.querySelector(`.${IB}__step-body`);
        flipEnterSide = "left";
        toScreen("context", "Return", "step-feedback", false);
      }
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
    function goReplay() {                        // stepper replay → step 1, state preserved
      if (state.step === 0 && state.screen !== "synthesis") return;
      const from = state.screen === "synthesis" ? "synthesis" : "step-" + (state.screen === "context" ? "context" : "feedback");
      state.step = 0;
      state.screen = "context";
      setEdge(from, "Replay to step 1", "step-context");
      renderModalBody(!reduced());
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
      // background inert while the dialog is open (§8) + viewport flag so CSS
      // can drop the navy padding and let the modal cover the full stage.
      const launch = viewport.querySelector(`.${IB}__launch`);
      const open = state.screen !== "launch";
      launch.toggleAttribute("inert", open);
      launch.setAttribute("aria-hidden", String(open));
      viewport.classList.toggle("is-modal-open", open);
    }

    /* ---- launch (in page, not modal) (§4.1) ---- */
    function renderLaunch() {
      const wrap = el("div", `${IB}__launch`);
      const left = el("div", `${IB}__launch-main`);

      // chip: arrow-up-right icon, divider, interactive name
      const chip = el("div", `${IB}__chip`);
      const chipIcon = el("span", `${IB}__chip-icon`);
      chipIcon.setAttribute("aria-hidden", "true");
      chipIcon.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
      chip.appendChild(chipIcon);
      chip.appendChild(el("span", `${IB}__chip-divider`));
      chip.appendChild(el("span", `${IB}__chip-name`, config.name));
      left.appendChild(chip);

      left.appendChild(el("h2", `${IB}__intent`, config.launch.intentTitle));
      left.appendChild(el("p", `${IB}__lead`, config.launch.contextParagraph));

      launchBtn = el("button", `${IB}__cta`, config.launch.launchLabel || "Launch Interactive");
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

    /* ---- modal shell: persistent top bar (name + stepper + close) + body -- */
    let bodyEl = null, dotsEl = null, replayBtn = null;
    function renderModal() {
      const modal = el("div", `${IB}__modal`);
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", `${IB}-dlg-title`);
      modal.tabIndex = -1;

      // Top bar: transparent, 3-column flex (name, navy stepper pill, close).
      const bar = el("div", `${IB}__topbar`);        // NEVER animates (§4.2, §7)

      const nameEl = el("div", `${IB}__topbar-name`);
      nameEl.appendChild(el("span", null, config.name));
      bar.appendChild(nameEl);

      // Navy stepper pill hanging from the top edge (rounded bottom corners).
      const stepper = el("div", `${IB}__stepper`);
      replayBtn = el("button", `${IB}__replay`);
      replayBtn.type = "button";
      replayBtn.setAttribute("aria-label", "Replay from step 1");
      replayBtn.innerHTML = SVG_REPLAY;
      replayBtn.addEventListener("click", goReplay);
      stepper.appendChild(replayBtn);
      dotsEl = el("div", `${IB}__stepper-dots`);
      stepper.appendChild(dotsEl);
      bar.appendChild(stepper);

      const close = el("button", `${IB}__topbar-close`);
      close.type = "button";
      close.setAttribute("aria-label", "Close interactive");
      close.innerHTML = SVG_CLOSE;
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
      // Stepper dots: N per steps count (up to 5). On step-context/feedback,
      // only the current step is active. On synthesis, all N dots are filled
      // and a "Completed!" label is appended after the dots.
      dotsEl.replaceChildren();
      const isSynth = state.screen === "synthesis";
      for (let idx = 0; idx < steps.length; idx++) {
        if (idx > 0) dotsEl.appendChild(el("span", `${IB}__stepper-line`));
        const dot = el("div", `${IB}__stepper-dot`);
        if (isSynth || idx === state.step) dot.classList.add("is-active");
        dot.appendChild(el("span", `${IB}__stepper-num`, String(idx + 1)));
        dotsEl.appendChild(dot);
      }
      if (isSynth) dotsEl.appendChild(el("span", `${IB}__stepper-completed`, "Completed!"));
      // Replay is hidden on step 1 (nothing to go back to) but still shown on
      // synthesis so the learner can jump back to the sequence.
      replayBtn.hidden = state.step === 0 && !isSynth;
    }

    function renderModalBody(slide) {
      if (!bodyEl) return;
      updateBar();

      // Capture the FLIP source rect BEFORE the DOM changes (options are the
      // shared element between context and feedback in the same step).
      const flipFromRect = flipOptionsFrom ? flipOptionsFrom.getBoundingClientRect() : null;
      flipOptionsFrom = null;
      const enterSide = flipEnterSide;
      flipEnterSide = null;

      let content;
      if (state.screen === "context") content = renderContext();
      else if (state.screen === "feedback") content = renderFeedback();
      else content = renderSynthesis();

      // Each render is wrapped in a full-size __screen so its background can
      // extend behind the (absolute) topbar and be tinted independently. The
      // topbar itself is drawn on top and never slides. Synthesis gets a
      // modifier so the right (cover-image) column can extend up behind the
      // topbar.
      const screen = el("div", `${IB}__screen`);
      if (state.screen === "synthesis") screen.classList.add(`${IB}__screen--synth`);
      screen.appendChild(content);

      // Slide transition (§7): OUTGOING screen translates to the left and the
      // INCOMING screen translates in from the right at the same rate — no
      // opacity change, so it feels like one mechanical push. Any orphan
      // screens from a rapid re-trigger are cleaned up first.
      const existing = bodyEl.querySelectorAll(`.${IB}__screen`);
      if (slide && !reduced() && existing.length > 0) {
        for (let i = 0; i < existing.length - 1; i++) existing[i].remove();
        const outgoing = existing[existing.length - 1];
        const withPulse = pulseIncoming;
        pulseIncoming = false;
        bodyEl.appendChild(screen);
        screen.classList.add(`${IB}__slide-entering`);
        if (withPulse) screen.classList.add(`${IB}__bg-pulse`);
        outgoing.classList.add(`${IB}__slide-leaving`);
        const cleanup = () => {
          if (outgoing.parentNode) outgoing.remove();
          screen.classList.remove(`${IB}__slide-entering`, `${IB}__bg-pulse`);
        };
        screen.addEventListener("animationend", cleanup, { once: true });
        setTimeout(cleanup, 1500);   // safety net if animationend never fires
        return;
      }

      // Initial render or reduced-motion: no slide, just swap. Preserve the
      // outgoing screen's scrollTop for the incoming one so a mid-transition
      // FLIP doesn't have to compensate for a scroll jump.
      pulseIncoming = false;
      const prevScrollTop = existing.length > 0 ? existing[existing.length - 1].scrollTop : 0;
      bodyEl.replaceChildren(screen);

      // Sibling column slides in from its own side so it doesn't just pop —
      // pairs with the FLIP on the shared options element.
      if (enterSide && !reduced()) {
        const sel = enterSide === "left"
          ? `.${IB}__col--context`
          : `.${IB}__col--feedback`;
        const enteringCol = screen.querySelector(sel);
        if (enteringCol) {
          const cls = `${IB}__slide-in-from-${enterSide}`;
          enteringCol.classList.add(cls);
          const clear = () => enteringCol.classList.remove(cls);
          enteringCol.addEventListener("animationend", clear, { once: true });
          setTimeout(clear, 1200);
        }
      }

      // FLIP: after the swap, if we captured a from-rect, invert the new
      // step-body (restate + options + action — the whole shared cluster)
      // into the old position and animate to the identity so it reads as a
      // smooth relocation. The surrounding content just changes.
      if (flipFromRect && !reduced()) {
        const sharedEl = screen.querySelector(`.${IB}__step-body`);
        if (sharedEl) {
          // Match the previous scroll so the incoming screen starts visually
          // identical to where the outgoing one was — no scroll jump before
          // the FLIP kicks in.
          if (prevScrollTop > 0) screen.scrollTop = prevScrollTop;
          const to = sharedEl.getBoundingClientRect();
          const dx = flipFromRect.left - to.left;
          const dy = flipFromRect.top - to.top;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            sharedEl.style.transition = "none";
            sharedEl.style.transform = `translate(${dx}px, ${dy}px)`;
            void sharedEl.offsetWidth;                              // force reflow
            sharedEl.style.transition = "transform 620ms cubic-bezier(0.4, 0, 0.2, 1)";
            sharedEl.style.transform = "";
            const cleanup = () => {
              sharedEl.style.transition = "";
              sharedEl.style.transform = "";
              // After the FLIP has settled, smoothly scroll the new screen
              // back to the top so the learner ends up at the start of the
              // feedback layout.
              if (screen.scrollTop > 0) {
                try { screen.scrollTo({ top: 0, behavior: "smooth" }); }
                catch (_) { screen.scrollTop = 0; }
              }
            };
            sharedEl.addEventListener("transitionend", cleanup, { once: true });
            setTimeout(cleanup, 900);
          }
        }
      }
    }

    /* ---- step-context (§4.2) ---- */
    function renderContext() {
      const i = state.step, step = steps[i];
      const c = el("div", `${IB}__content`);
      const left = el("div", `${IB}__col ${IB}__col--context`);

      const ctx = el("div", `${IB}__ctx-frame`);
      const title = el("h2", `${IB}__ctx-title`, step.contextTitle);
      title.id = `${IB}-dlg-title`;
      ctx.appendChild(title);
      ctx.appendChild(el("p", `${IB}__ctx-desc`, step.contextDescription));
      left.appendChild(ctx);

      // "What you need to do" cue — chip icon + label (fixed §6) + task text.
      const taskFrame = el("div", `${IB}__task-frame`);
      const cue = el("div", `${IB}__task-cue`);
      const cueIcon = el("span", `${IB}__task-icon`);
      cueIcon.innerHTML = SVG_ARROW_OUTWARD;
      cue.appendChild(cueIcon);
      cue.appendChild(el("span", `${IB}__task-cue-text`, "What you need to do"));
      taskFrame.appendChild(cue);
      taskFrame.appendChild(el("p", `${IB}__task-desc`, step.task));
      left.appendChild(taskFrame);
      c.appendChild(left);

      const right = el("div", `${IB}__col ${IB}__col--step`);
      // Wrap restate + options + action in __step-body so the whole cluster
      // can be treated as one shared element and FLIP'd across the context ↔
      // feedback transitions.
      const stepBody = el("div", `${IB}__step-body`);
      stepBody.appendChild(el("p", `${IB}__restate`, step.taskRestatement));
      stepBody.appendChild(renderOptions(i));
      stepBody.appendChild(renderAction(i));    // shown disabled until an option is picked
      right.appendChild(stepBody);
      c.appendChild(right);
      return c;
    }

    /* ---- step-feedback (§4.3): options move to the left, feedback on right ---- */
    function renderFeedback() {
      const i = state.step, step = steps[i];
      const c = el("div", `${IB}__content ${IB}__content--feedback`);

      // Left: keyboard_return button + step body (restate + options + action).
      const left = el("div", `${IB}__col ${IB}__col--step`);
      const ret = el("button", `${IB}__return-btn`);
      ret.type = "button";
      ret.setAttribute("aria-label", "Return to the context for this step");
      ret.innerHTML = SVG_KEYBOARD_RETURN;
      ret.addEventListener("click", goReturn);
      left.appendChild(ret);

      const body = el("div", `${IB}__step-body`);
      body.appendChild(el("p", `${IB}__restate`, step.taskRestatement));
      body.appendChild(renderOptions(i));
      body.appendChild(renderAction(i));
      left.appendChild(body);
      c.appendChild(left);

      // Right: qualifier row (icon + label) + response feedback text.
      const right = el("div", `${IB}__col ${IB}__col--feedback`);
      const opt = state.displayed[i];
      const o = step.options[opt];
      const q = qualOf(o.qualifier);
      const qEl = el("div", `${IB}__qual ${IB}__qual--${q.tone}`);
      const qIcon = el("span", `${IB}__qual-icon`);
      qIcon.innerHTML = q.svg;
      qEl.appendChild(qIcon);
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

        // Content pane (white card with the option text on the left). The
        // "explored" and "locked" states are announced to screen readers only
        // — the teal border / faded look already communicates them visually.
        const content = el("span", `${IB}__option-content`);
        content.appendChild(el("span", `${IB}__option-text`, o.label));
        if (explored) content.appendChild(srBadge("explored", ""));
        if (lockedThis) content.appendChild(srBadge("unavailable", ""));  // announced (§8)
        b.appendChild(content);

        // Right indicator: default 10px teal strip → 69px teal box with arrow
        // on hover / when currently displayed (§R5).
        const ind = el("span", `${IB}__option-indicator`);
        const arrow = el("span", `${IB}__option-arrow`);
        arrow.innerHTML = SVG_ARROW_FORWARD;
        ind.appendChild(arrow);
        b.appendChild(ind);

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

    /* ---- synthesis (§4.4) — Figma US-09 layout:
     * Left col (~760): narrative (conclusion + para + additional title + bullets)
     * Right col (~520): full-height cover image + gradient overlay + a Key
     *   Takeaway card and the Restart / Exit buttons pinned to the bottom-right.
     * The right col extends behind the (absolute) topbar. ---------------------*/
    function renderSynthesis() {
      const c = el("div", `${IB}__content ${IB}__content--synth`);

      const left = el("div", `${IB}__col ${IB}__col--synth-left`);
      const v = config.synthesisVariant;
      if (v === "compare") renderCompare(left);
      else if (v === "record") renderRecord(left);
      else renderMinimal(left);
      c.appendChild(left);

      const right = el("div", `${IB}__col ${IB}__col--synth-right`);
      // Cover image full-column (extends behind the topbar).
      if (config.cover !== null) {
        const img = el("img", `${IB}__synth-cover-img`);
        img.src = config.cover || COVER;
        img.alt = "";
        right.appendChild(img);
      }
      // Gradient overlay that fades the image into mint at the bottom so the
      // takeaway card and buttons sit on solid ground.
      right.appendChild(el("div", `${IB}__synth-cover-overlay`));

      // Bottom-aligned content: takeaway card + actions row.
      const bottom = el("div", `${IB}__synth-bottom`);

      const s = config.synthesis;
      const card = el("div", `${IB}__takeaway`);
      const cardTitleRow = el("div", `${IB}__takeaway-title-row`);
      const pin = el("span", `${IB}__takeaway-icon`);
      pin.innerHTML = SVG_PUSH_PIN;
      cardTitleRow.appendChild(pin);
      cardTitleRow.appendChild(el("span", `${IB}__takeaway-title`, "Key Takeaway"));
      card.appendChild(cardTitleRow);
      card.appendChild(el("p", `${IB}__takeaway-para`, s.takeawayPara));
      bottom.appendChild(card);

      const actions = el("div", `${IB}__synth-actions`);
      const restartBtn = el("button", `${IB}__synth-btn ${IB}__synth-btn--restart`);
      restartBtn.type = "button";
      restartBtn.appendChild(el("span", `${IB}__synth-btn-label`, "Restart"));
      const restartIco = el("span", `${IB}__synth-btn-icon`);
      restartIco.innerHTML = SVG_REPLAY;
      restartBtn.appendChild(restartIco);
      restartBtn.addEventListener("click", restart_);

      const exitBtn = el("button", `${IB}__synth-btn ${IB}__synth-btn--exit`);
      exitBtn.type = "button";
      exitBtn.appendChild(el("span", `${IB}__synth-btn-label`, "Exit"));
      const exitIco = el("span", `${IB}__synth-btn-icon`);
      exitIco.innerHTML = SVG_CLOSE;
      exitBtn.appendChild(exitIco);
      exitBtn.addEventListener("click", () => { setEdge("synthesis", "Exit", "launch"); closeModal("synthesis"); });

      actions.appendChild(restartBtn);
      actions.appendChild(exitBtn);
      bottom.appendChild(actions);

      right.appendChild(bottom);
      c.appendChild(right);
      return c;
    }
    function restart_() { restart(); }

    function renderMinimal(left) {
      const s = config.synthesis.minimal;   // authored content only (§R7)

      const sec1 = el("div", `${IB}__synth-section`);
      const t1 = el("h2", `${IB}__synth-title`, s.conclusionTitle);
      t1.id = `${IB}-dlg-title`;
      sec1.appendChild(t1);
      sec1.appendChild(el("p", `${IB}__synth-para`, s.outcomePara));
      left.appendChild(sec1);

      const sec2 = el("div", `${IB}__synth-section`);
      sec2.appendChild(el("h3", `${IB}__synth-sub`, s.additionalTitle));
      const ul = el("ul", `${IB}__synth-list`);
      s.bullets.forEach((b) => ul.appendChild(el("li", null, b)));
      sec2.appendChild(ul);
      left.appendChild(sec2);
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
    contextTitle: "A learner reads a situation whose cues pull against long-held habits of response",
    contextDescription: "Someone is deciding how to act in a moment where the situation and their disposition do not fully agree. Weigh what this specific moment seems to demand against what the person tends to do by default. Consider what each response reveals about the reasoning behind it, and what the choice would signal to someone watching closely.",
    task: "Choose the response you believe best reflects sound judgement in this situation. There is no single correct answer — the point is to make your reasoning explicit to yourself, and to notice when a habitual response would miss what the moment actually requires.",
    taskRestatement: "Briefly restate the learner task for this step.",
    options: [
      q("Read the situation carefully and act on the specific cues in front of you before defaulting to what usually works in similar cases", "best", "Strong choice — you read the moment before defaulting to habit, which is exactly the judgement this step is testing."),
      q("Rely on the experience you have built up across many similar situations, trusting the pattern you have seen before", "incorrect", "Experience helps, but here the situation has shifted in ways that habitual responses tend to miss. That is the failure mode this step surfaces."),
      q("Pause and gather more information before committing to any single course of action, even if that means acting later than others would", "correct", "Reasonable — though at some point judgement under uncertainty becomes the task, because waiting is not always available."),
      q("Consult with someone who has more distance from the situation and can weigh the cues without the pressure you are feeling in the moment", "correct", "A sound instinct in many cases. The trade-off is time and the fact that outside perspective can miss what only presence in the moment reveals."),
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
      config: { name: "What shapes behaviour?", cover: COVER, launch: { intentTitle: "Weigh situation against disposition", contextParagraph: "You will make two judgement calls, then see how your reasoning holds up. Choose the response you think is best — your first choice is what counts.", launchLabel: "Launch Interactive" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step(), step({ contextTitle: "A second situation" })] },
    },
    {
      id: "explore-compare", group: "Optional configuration", label: "Explore-all · compare",
      description: "Explore every option before continuing; compare synthesis reports your primary response per step.",
      config: { name: "Reading a situation", cover: COVER, launch: { intentTitle: "Explore every angle", contextParagraph: "For each step, explore all the responses and their feedback, then compare how they line up.", launchLabel: "Start exploring" }, synthesisVariant: "compare", synthesis: synthAll, steps: [exploreStep(), exploreStep({ contextTitle: "Another angle" })] },
    },
    {
      id: "mixed-record", group: "Optional configuration", label: "Mixed modes · record",
      description: "Step 1 asks for judgement (choose-one), step 2 for exploration (explore-all); record synthesis.",
      config: { name: "Judgement, then exploration", cover: COVER, launch: { intentTitle: "First decide, then explore", contextParagraph: "The first step asks for your best judgement. The second asks you to explore every response. The recap records what you did.", launchLabel: "Launch Interactive" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Now explore" })] },
    },
    {
      id: "record-3", group: "Optional configuration", label: "Three steps · record",
      description: "Three steps, record synthesis — the step-by-step recap.",
      config: { name: "Three decisions", cover: COVER, launch: { intentTitle: "Three decisions in a row", contextParagraph: "Work through three related decisions; the recap lists your response to each.", launchLabel: "Launch Interactive" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Second decision" }), step({ contextTitle: "Third decision" })] },
    },

    /* ---- Edge cases (§10) ---- */
    {
      id: "single-compare", group: "Edge cases", label: "Single step → Compare on step 1",
      description: "A one-step interactive: the action button reads Compare on step 1, and Return is hidden.",
      config: { name: "One decision", cover: COVER, launch: { intentTitle: "A single judgement", contextParagraph: "Just one step. The action button reads Compare, not Continue, because this is already the last step.", launchLabel: "Launch Interactive" }, synthesisVariant: "compare", synthesis: synthAll, steps: [step()] },
    },
    {
      id: "two-options", group: "Edge cases", label: "Step with two options",
      description: "Explore-all with only two options — the gate is satisfied quickly, which is correct.",
      config: { name: "A quick gate", cover: COVER, launch: { intentTitle: "Only two responses", contextParagraph: "With two options in explore-all, the gate opens after both are explored.", launchLabel: "Launch Interactive" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [exploreStep({ options: [q("Act on the cues", "best", "You read the moment first."), q("Fall back on habit", "incorrect", "Habit misses what has changed here.")] })] },
    },
    {
      id: "long-text", group: "Edge cases", label: "Long option / feedback text",
      description: "Long option labels and long feedback must wrap without breaking layout.",
      config: { name: "Wrapping under pressure", cover: COVER, launch: { intentTitle: "When the text runs long", contextParagraph: "Some authors write long options and long feedback. The layout has to hold — both wrap without breaking the two-column structure or the modal.", launchLabel: "Launch Interactive" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step({ options: [
        q("Read the situation carefully before acting, giving weight to the specific cues in front of you rather than defaulting to what usually works", "best", "A strong choice. Reading the situation first, before reaching for a habitual response, is exactly the judgement this step is testing — and it is a habit that transfers across very different settings, from a classroom to a negotiation to a decision made alone under real uncertainty."),
        q("Rely on the experience you have accumulated over many similar past situations", "incorrect", "Experience is valuable, but the trap here is that this situation only looks similar. The cues that matter have shifted, and a response tuned to the old pattern will miss them. This is the failure mode the step is designed to surface."),
        q("Pause and gather more information before committing to any single course of action", "correct", "Reasonable and often wise — though notice that at some point the task itself is to exercise judgement under uncertainty, because more information is not always available."),
      ] })] },
    },
    {
      id: "no-cover", group: "Edge cases", label: "Missing cover image",
      description: "No cover image supplied — the launch and synthesis layouts must not collapse.",
      config: { name: "No cover supplied", cover: null, launch: { intentTitle: "Layout holds without a cover", contextParagraph: "When no cover image is provided, the column reserves its space and the layout stays intact.", launchLabel: "Launch Interactive" }, synthesisVariant: "minimal", synthesis: synthAll, steps: [step()] },
    },
    {
      id: "five-steps", group: "Edge cases", label: "Five steps (maximum)",
      description: "The maximum of five steps (§R6). Return works across all of them.",
      config: { name: "The full length", cover: COVER, launch: { intentTitle: "Five decisions", contextParagraph: "Five steps is the maximum an interactive may have. Continue moves forward; Return moves back with state preserved.", launchLabel: "Launch Interactive" }, synthesisVariant: "record", synthesis: synthAll, steps: [step(), exploreStep({ contextTitle: "Step two" }), step({ contextTitle: "Step three" }), exploreStep({ contextTitle: "Step four" }), step({ contextTitle: "Step five" })] },
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
