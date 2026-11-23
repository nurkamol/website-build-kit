/**
 * Which missed addresses are worth counting — shared by the endpoint that
 * records them (src/pages/api/missed.ts) and the script that reads them
 * (scripts/misses.mjs), so both agree on what a real visitor's miss looks like.
 *
 * Plain .mjs so Node can import it without a build, the same as lastmod.mjs.
 */

/*
 * Requests only scanners make: WordPress logins and internals, server scripts,
 * dot-files, archives and backups, other software's admin panels. A rebuilt
 * WordPress site gets thousands of these the day it launches; listed beside a
 * real visitor's broken link they bury it, and none of them wants a redirect —
 * a 301 from an admin path tells a scanner the site moved.
 */
const PROBE =
  /(?:(?:^|\/)(?:wp-(?:admin|login|includes|content\/(?:plugins|themes|upgrade|debug)|json|config|cron|signup|trackback)|xmlrpc|cgi-bin|phpmyadmin|pma|adminer|administrator|vendor\/phpunit|boaform|actuator|_profiler|server-status|autodiscover|owa|ecp|remote\/login|_ignition)(?:$|[/.?])|\.(?:php\d?|phtml|aspx?|ashx|jsp|cgi|pl|env|ini|sql|bak|old|orig|save|swp|zip|tar|gz|tgz|rar|7z|git|svn|ds_store|log|ya?ml|toml|conf|cfg|pem|key|sh|exe|dll)(?:$|\/)|\/\.(?!well-known\/))/i;

/**
 * The path as it is stored and listed, or null when it is not worth keeping:
 * a probe, junk, or anything that looks like it carries a person.
 *
 * ⚠ PERSONAL DATA IN A PATH IS REAL. `/unsubscribe/jane@example.com/`,
 *   `/booking/4471-0098/` — a mistyped link from an email or a booking system
 *   can carry an address or an ID, and this store keeps paths for months. So
 *   an `@`, or a run of eight or more digits, drops the path rather than
 *   storing it. The query string never reaches here at all: the beacon sends
 *   `location.pathname` only.
 */
export function cleanMissedPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 300) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (PROBE.test(raw) || PROBE.test(decoded)) return null;
  if (/[\u0000-\u001f\u007f<>"'`{}\\]/.test(decoded)) return null; // markup, quotes, control characters
  if (/\b(?:select|union|script|onerror|alert)\b.*[(=]/i.test(decoded)) return null; // injection attempts
  if (/@/.test(decoded) || /\d{8,}/.test(decoded.replace(/[\s.-]/g, ''))) return null;
  return raw;
}

/** A referrer reduced to its host — never the page, never the query. "" when unusable. */
export function cleanReferrerHost(raw) {
  if (typeof raw !== 'string') return '';
  const host = raw.trim().toLowerCase().replace(/^www\./, '');
  return /^[a-z0-9.-]{1,100}$/.test(host) && host.includes('.') ? host : '';
}
