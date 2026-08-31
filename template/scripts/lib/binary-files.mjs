/**
 * Tracked source files that git and grep treat as BINARY.
 *
 * ⚠ THE PROVENANCE SWEEP IS WRITTEN WITH `grep -I`, WHICH SKIPS THEM. One
 *   script used a literal NUL as a string sentinel, which made it binary, which
 *   made it invisible to the sweep — while carrying a client's entire brand,
 *   both typefaces and a base64 palette. Two commits.
 *
 * The tools fail quietly rather than loudly: `grep` returns nothing and exits 1
 * exactly as it does for no-match, and `git diff` says only
 * `Binary files differ`, so changes never appear in review.
 *
 * ⚠ THE OBVIOUS IMPLEMENTATION IS A FUNCTION THAT ALWAYS RETURNS NOTHING.
 *   `git grep -I --files-without-match ''` reads like the answer and prints
 *   nothing either way. Ask git which files it tracks, ask again which it can
 *   read as text, and take the difference.
 *
 * ⚠ AN EMPTY FILE IS NOT A BINARY ONE. `git grep ''` matches LINES, and a
 *   zero-byte file has none, so the naive difference reports every empty file.
 *   Excluded by size rather than by guessing.
 *
 * Shared by the kit's own `check:binary` and by `check-drift.mjs`, which runs
 * in a delivered project. One implementation, because two would be free to
 * disagree about which files count.
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

/** The extensions a human reviews. A .png is legitimately binary; a .mjs is not. */
export const SOURCE_GLOBS = [
  '*.mjs',
  '*.js',
  '*.cjs',
  '*.ts',
  '*.tsx',
  '*.astro',
  '*.css',
  '*.md',
  '*.json',
  '*.jsonc',
  '*.yml',
  '*.yaml',
  '*.html',
  '*.txt',
  '*.sh',
];

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    /* `git grep` exits 1 when nothing matches, which is not an error here. */
    if (err.status === 1 && typeof err.stdout === 'string') {
      return err.stdout.split('\n').filter(Boolean);
    }
    throw err;
  }
};

/**
 * `{ tracked, binary }` for the current working directory.
 * Throws if git is unavailable — a silent empty result would be a lie.
 */
export function binarySourceFiles() {
  const tracked = git('ls-files', '--', ...SOURCE_GLOBS);
  const textual = new Set(git('grep', '-I', '-l', '', '--', ...SOURCE_GLOBS));
  const binary = tracked.filter((file) => {
    if (textual.has(file)) return false;
    try {
      return statSync(file).size > 0;
    } catch {
      return false; // deleted but still indexed
    }
  });
  return { tracked, binary };
}
