# Build state

⚠ **Written at every gate, not continuously.** A file edited every few minutes is noise and
nobody reads it. Update it when a phase gate passes — `build.md` §3.

**Delete this file at handover**, folding what survived into `docs/handover.md`. It is a
working file, not a deliverable: its **Integrations** and **Preserve** lines are the source for
`handover.md` §3 and the "deliberately not built" list in `handover.md` §4.

```
## Phase 0 · Recon          [in progress]

Gates passed   —
Locked         —
Archetype      ⚠ from the win, not the industry — archetypes.md
Open           ! ⚠ blocking items go here, with a date
               ? ⚠ open questions
Next           ⚠ one line
```

## Integrations

⚠ One line each, from `recon/integrations.md`. **Every line ends in a verified state or an
explicit dated drop. No third state** — "integrations" as one task is the item that silently
ships at 80%, and a missing conversion tag is invisible for a month.

```
- [ ] ⚠ GA4 · G-XXXXXXXXXX · not ported · ⚠ confirm the client owns this account
- [ ] ⚠ vendor · detected in markup · not ported · ⚠ owner unknown
```

## Preserve

⚠ Paths other systems point at, from `recon/preserved.md`. Losing one is silent — see
`stacks.md` §1d.

```
- [ ] ⚠ /sitemap_index.xml → emitted at the old path, or 301 to the new one
- [ ] ⚠ verification file or DNS TXT carried over
- [ ] ⚠ /feed/ → the new feed path, never dropped
```

## Decisions locked

⚠ `Locked` means settled — do not reopen without saying so. This is the row that stops a pivot
quietly becoming a rewrite. Stack, providers, archetype, and the design direction chosen from a
real comp on staging (`design.md` §1).
