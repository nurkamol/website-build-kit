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
 * ── ⚠ THE FIRST FIX FOR THAT DID NOTHING AT ALL ────────────────────────────
 * It passed `--force-prefers-color-scheme=<scheme>` to Chrome. There is no such
 * switch. Chrome ignores flags it does not know WITHOUT A WORD, so both runs
 * measured whatever scheme the machine was in — light twice on a CI runner,
 * dark twice on this laptop — while printing "clean in light and dark".
 *
 * Measured on Chrome 148, reading the media query the page itself sees:
 *
 *     no flag                                  dark    (this machine's setting)
 *     --force-prefers-color-scheme=light       dark    ← ignored
 *     --force-dark-mode                        dark    ← browser UI only
 *     --blink-settings=preferredColorScheme=0  dark
 *     --blink-settings=preferredColorScheme=1  light
 *
 * So the dark palette of every site built with this kit went unmeasured by the
 * gate that reported measuring it, and the evidence pack said so in writing.
 * A gate that always passes is worse than no gate; one that produces a dated
 * conformance document is worse again.
 *
 * ── AND WHY THE REPLACEMENT IS CHECKED AT RUN TIME ─────────────────────────
 * `preferredColorScheme` is a Blink setting taken by its ORDINAL — the mojom
 * enum `PreferredColorScheme { kDark, kLight }`. An ordinal is not a name: if
 * that enum is ever reordered or the setting renamed, the flag goes quiet in
 * exactly the same way, and out-of-range values fall back to light rather than
 * erroring (`=2` renders light).
 *
 * `assertForced()` therefore never trusts the flag. It launches Chrome, reads
 * `prefers-color-scheme` from a page, and refuses when what came back is not
 * what was asked for. That assertion is the load-bearing part of this file —
 * the flag is only how it is currently achieved.
 */

export const SCHEMES = ['light', 'dark'];

/** mojom::blink::PreferredColorScheme — kDark = 0, kLight = 1. */
const ORDINAL = { dark: 0, light: 1 };

/** The Chrome arguments that pin `prefers-color-scheme` for a whole session. */
export function schemeArgs(scheme) {
  return [`--blink-settings=preferredColorScheme=${ORDINAL[scheme]}`];
}

/** Arguments with any previous scheme forcing — including the dead flag — removed. */
function withoutScheme(args) {
  return args.filter(
    (a) =>
      !a.startsWith('--force-prefers-color-scheme') &&
      !a.startsWith('--blink-settings=preferredColorScheme'),
  );
}

/**
 * A pa11y-ci config with the colour scheme pinned.
 *
 * `.pa11yci.json` stays the only place the URL list lives; the scheme is
 * injected into a copy at run time, because two config files is two URL lists
 * and one of them goes stale.
 */
export function configForScheme(base, scheme) {
  const defaults = { ...(base.defaults ?? {}) };
  const launch = { ...(defaults.chromeLaunchConfig ?? {}) };
  const args = withoutScheme(launch.args ?? []);

  return {
    ...base,
    defaults: {
      ...defaults,
      chromeLaunchConfig: { ...launch, args: [...args, ...schemeArgs(scheme)] },
    },
  };
}

/**
 * Prove Chrome actually answers `prefers-color-scheme` the way we asked, by
 * launching it and reading the media query from a page.
 *
 * Returns null when the forcing works, and the reason it cannot be trusted
 * otherwise — a string the caller prints before refusing to run. It is a
 * refusal rather than a warning on purpose: a scheme that did not take means
 * the run measures one palette twice and reports two.
 */
export async function assertForced(scheme) {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    return (
      'puppeteer is not installed, so the colour scheme cannot be verified.\n' +
      '  It normally arrives with pa11y-ci: npm install'
    );
  }

  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox', ...schemeArgs(scheme)] });
    const page = await browser.newPage();
    /* A data: URL — the probe must not depend on the site being up, because
       "the server is down" and "the flag stopped working" would then look the
       same and the second one is the dangerous one. */
    await page.goto('data:text/html,<!doctype html><title>scheme probe</title>');
    const got = (await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
      ? 'dark'
      : 'light';
    if (got !== scheme) {
      return (
        `asked Chrome for ${scheme} and the page reported ${got}.\n` +
        `  ${schemeArgs(scheme).join(' ')} no longer forces the scheme, so a run now\n` +
        `  measures this machine's palette twice and reports it as both.`
      );
    }
    return null;
  } catch (error) {
    return `could not launch Chrome to verify the colour scheme: ${String(error).slice(0, 200)}`;
  } finally {
    await browser?.close();
  }
}
