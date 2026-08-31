---
description: Audit a site built from an older kit, report what it is behind on, then fix what you choose
---

Invoke the `media-audit` skill and run it end to end.

`$ARGUMENTS` — a path means audit that project. Nothing means audit the current directory.

⚠ **Detect before offering anything.** Run `npm run check:drift` first and come back with what is
actually true of this site — which findings, how many images, whose problem each one is. A menu
offered before there are findings is a menu nobody can choose from.

Report the clean rows as well as the drifted ones. A report that says what was checked and found
fine is trusted; one listing only problems reads as a pitch.

Then recommend a route and say why. On a site with a client actively editing, *only what the
client can see* is usually right: smallest change, most visible benefit, no regenerated assets.
