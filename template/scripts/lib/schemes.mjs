/**
 * Colour schemes an accessibility run has to cover.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A site with a light and a dark palette has TWO sets of contrast pairs, and
 * testing one proves nothing about the other. pa11y drives Chrome, and Chrome
 * picks a scheme from the machine it runs on — so the same page passes on a
 * developer's laptop in dark mode and fails in CI in light, from one commit,
 * with nothing to say which half was measured.
 *
 * That is not hypothetical. The kit's own landing page passed locally and
 * failed the moment it ran on a light-mode runner:
 *
 *     --ink-3 on the page background   4.83:1 dark   ·   3.91:1 light
 *
 * A real AA failure, in the half nobody happened to test. Forcing the scheme
 * removes the luck.
 *
 * ── IT RUNS BOTH EVEN WITH NO DARK MODE ────────────────────────────────────
 * Deliberately. A fresh template ships no `prefers-color-scheme` rule at all,
 * so the two runs are identical and cost a few seconds. The day somebody adds
 * a dark palette is exactly the day the blind spot would otherwise open, and
 * a check you have to remember to switch on is a check that is off.
 */

export const SCHEMES = ['light', 'dark'];

/**
 * A pa11y-ci config with the colour scheme pinned.
 *
 * `--force-prefers-color-scheme` makes Chrome answer the media query the same
 * way on every machine, which is the only reason a contrast result is
 * comparable between a laptop and a runner.
 */
export function configForScheme(base, scheme) {
  const defaults = { ...(base.defaults ?? {}) };
  const launch = { ...(defaults.chromeLaunchConfig ?? {}) };
  const args = (launch.args ?? []).filter((a) => !a.startsWith('--force-prefers-color-scheme'));

  return {
    ...base,
    defaults: {
      ...defaults,
      chromeLaunchConfig: { ...launch, args: [...args, `--force-prefers-color-scheme=${scheme}`] },
    },
  };
}
