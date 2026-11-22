/**
 * Read the form definitions in `src/data/forms.ts` from a plain Node script.
 *
 * Used by `check-form.mjs` (which refuses a bad definition before a build) and
 * `forms-import.mjs` (which proves its own write parses).
 *
 * ── WHY EVALUATE IT RATHER THAN GREP IT ────────────────────────────────────
 * Since forms became data, the names a visitor's browser posts are no longer in
 * any markup — `LeadForm.astro` writes `name={f.name}`. A regex over the TS file
 * would have to find form boundaries, nested `fields: [...]` arrays and quoted
 * names through comments and spreads; the first version that got any of that
 * wrong would pass a duplicate. So the file is transpiled with the project's
 * own `typescript` and run, with every import replaced by a stand-in that
 * answers anything — `services.map(...)`, a spread, a call — with another
 * stand-in. A value built from an import is therefore UNRESOLVED, and callers
 * skip checks on it rather than guess; a literal is checked exactly.
 *
 * It runs the project's own source, as `astro build` does a moment later.
 */

import { existsSync, readFileSync } from 'node:fs';

export const FORMS_FILE = 'src/data/forms.ts';

/**
 * Names a definition's field may not use, and why. `company` is the honeypot:
 * a real field with that name discards every enquiry that fills it in. `form`
 * and `page` are posted by `LeadForm.astro` itself. The rest are properties of
 * a <form> element that a control of the same name SHADOWS — `form.reset()`
 * stops being a function — which the component defends against but other
 * scripts on the page will not.
 */
export const RESERVED_NAMES = {
  company: 'the honeypot',
  form: 'posted by LeadForm.astro — which definition this is',
  page: 'posted by LeadForm.astro — the page the form was sent from',
  'cf-turnstile-response': "Turnstile's token",
  action: 'shadows form.action in the browser',
  method: 'shadows form.method in the browser',
  submit: 'shadows form.submit() in the browser',
  reset: 'shadows form.reset() in the browser',
  elements: 'shadows form.elements in the browser',
  length: 'shadows form.length in the browser',
};

const UNKNOWN_MARK = Symbol('unresolved');

/** A value that answers every question with itself: property, call, spread, coercion. */
function unknownValue() {
  const target = function unresolved() {};
  const proxy = new Proxy(target, {
    get(_t, key) {
      if (key === UNKNOWN_MARK) return true;
      if (key === Symbol.iterator) return function* () { yield proxy; };
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined; // never thenable — an await must not hang on it
      return proxy;
    },
    apply: () => proxy,
    construct: () => proxy,
  });
  return proxy;
}

export const isUnresolved = (value) => typeof value === 'function' && value[UNKNOWN_MARK] === true;

/**
 * → `{ forms: [{ key, def }] }`, or `{ error }` when the file cannot be read.
 * `def` is the object as written; any part built from an import is unresolved.
 */
export async function loadForms(file = FORMS_FILE) {
  if (!existsSync(file)) return { forms: [], missing: true };
  let ts;
  try {
    ts = (await import('typescript')).default;
  } catch {
    return { error: `cannot read ${file}: the typescript package is not installed (npm install)` };
  }
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  try {
    new Function('require', 'module', 'exports', js)(() => unknownValue(), module, module.exports);
  } catch (error) {
    return { error: `cannot evaluate ${file}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const forms = module.exports.forms;
  if (!forms || typeof forms !== 'object' || isUnresolved(forms)) {
    return { error: `${file} does not export a \`forms\` object` };
  }
  return { forms: Object.entries(forms).map(([key, def]) => ({ key, def })) };
}
