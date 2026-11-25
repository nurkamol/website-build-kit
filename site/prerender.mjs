/**
 * Render the page to HTML at build time and put it in dist/index.html, so every word
 * is in the file: crawlers read it, it works with JavaScript off, and `audit:docs`
 * checks the failure count in the built page rather than trusting the source.
 * React then hydrates the same markup.
 */
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { render } from './dist-ssr/entry-server.js';

const file = 'dist/index.html';
const html = readFileSync(file, 'utf8');
if (!html.includes('<!--app-->')) throw new Error('dist/index.html has no <!--app--> marker to render into');
writeFileSync(file, html.replace('<!--app-->', render()));
rmSync('dist-ssr', { recursive: true, force: true });

/* ⚠ brand/ STAYS AT site/brand/, NOT IN public/. The README packaged with every version already
   on npm loads the logo from raw.githubusercontent.com/…/master/site/brand/ — those READMEs cannot
   be edited, so moving the folder would break the logo on every published version. Copied here. */
cpSync('brand', 'dist/brand', { recursive: true });
console.log('prerendered dist/index.html');
