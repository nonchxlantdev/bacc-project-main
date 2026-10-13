/**
 * The only file that imports driver.js. Everything portal-specific — which
 * steps, when to run, phone drawer, saving progress — lives in TourProvider;
 * this file just draws a spotlight and a popover for a ready list of steps.
 * Swapping the library means rewriting this file and nothing else.
 */
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function description(step) {
  const body = `<span class="bacc-tour-body">${escapeHtml(step.body)}</span>`;
  if (!step.faq) return body;
  return `${body}<a class="bacc-tour-faq" href="/help#${escapeHtml(step.faq)}" data-faq="${escapeHtml(step.faq)}">More in Help</a>`;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Run a tour. `steps` are already resolved for the role and checked against
 * the page: each has `element` (an Element) or none for a centred message.
 *
 *   beforeStep(step)  awaited before showing a step (open the phone drawer…)
 *   onFaq(groupId)    the person followed "More in Help"
 *   onEnd(reason)     'done' | 'skipped' | 'faq' | 'interrupted', exactly once
 *
 * Returns { stop() } — ends the tour as 'interrupted' (route change, unmount).
 */
export function runTour({ steps, beforeStep = async () => {}, onFaq = () => {}, onEnd = () => {} }) {
  let ended = false;
  let busy = false;
  let reason = null;

  const instance = driver({
    animate: !prefersReducedMotion(),
    smoothScroll: !prefersReducedMotion(),
    allowClose: true,
    allowKeyboardControl: true,
    // A stray tap on the dimmed page should not throw away someone's place in
    // the tour; × and Esc are the ways out.
    overlayClickBehavior: () => {},
    // Tours point things out; they never press anything for you.
    disableActiveInteraction: true,
    stagePadding: 6,
    stageRadius: 8,
    popoverOffset: 12,
    overlayColor: '#07152b',
    overlayOpacity: 0.62,
    popoverClass: 'bacc-tour',
    showProgress: steps.length > 1,
    progressText: '{{current}} of {{total}}',
    showButtons: ['next', 'previous', 'close'],
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: steps.map((step) => ({
      element: step.element ?? undefined,
      popover: {
        title: escapeHtml(step.title),
        description: description(step),
        side: step.side,
        align: step.align ?? 'start',
      },
    })),
    onNextClick: () => go(1),
    onPrevClick: () => go(-1),
    onCloseClick: () => finish('skipped'),
    onPopoverRender: (popover, { state }) => {
      const index = state.activeIndex ?? 0;
      const { wrapper, title, closeButton, nextButton, previousButton } = popover;
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-modal', 'false');
      title.id = 'bacc-tour-title';
      wrapper.setAttribute('aria-labelledby', 'bacc-tour-title');
      closeButton.setAttribute('aria-label', 'Skip tour');
      closeButton.setAttribute('title', 'Skip tour');
      if (index === 0) previousButton.style.display = 'none';
      wrapper.querySelector('.bacc-tour-faq')?.addEventListener('click', (event) => {
        event.preventDefault();
        const group = event.currentTarget.getAttribute('data-faq');
        finish('faq');
        onFaq(group);
      });
      // Keyboard and screen-reader users land on the main action.
      requestAnimationFrame(() => nextButton.focus({ preventScroll: true }));
    },
    onDestroyed: () => {
      if (!ended) {
        ended = true;
        onEnd(reason ?? 'skipped');
      }
    },
  });

  async function show(index) {
    busy = true;
    try {
      await beforeStep(steps[index]);
    } finally {
      busy = false;
    }
    if (reason) return;
    if (instance.isActive()) instance.moveTo(index);
    else instance.drive(index);
  }

  function go(delta) {
    if (busy || reason) return;
    const current = instance.getActiveIndex() ?? 0;
    const next = current + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      finish('done');
      return;
    }
    show(next);
  }

  function finish(why) {
    if (reason) return;
    reason = why;
    if (instance.isActive()) {
      instance.destroy();
    } else if (!ended) {
      // Stopped before the first step was drawn (still opening the drawer).
      ended = true;
      onEnd(why);
    }
  }

  show(0);

  return {
    stop: () => finish('interrupted'),
  };
}
