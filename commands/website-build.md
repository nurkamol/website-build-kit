---
description: Start a production marketing site build — discovery, stack selection, then build
---

Invoke the `website-build` skill and run it end to end.

`$ARGUMENTS` — a URL means migrate from it: recon before asking anything. A business name
alone means greenfield. Nothing means **ask what there is to import first** (Round 0) before
any other question; clients routinely forget to mention a site they already have.

On a URL, come back with three things, not one: the URL and template-family inventory, the
integrations detected in the markup, and the accessibility baseline. `npm run recon -- <url>`
from the template does the first two mechanically and writes the inventory every later step
reads — the redirect map, the go-live route check, week-one 404 triage.

Do not skip discovery, and do not skip the mobile questions in Round 3 — menu pattern and
sticky CTA are the ones left until they break.
