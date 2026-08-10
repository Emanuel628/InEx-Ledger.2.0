# Archived — Reference Only

This directory is retired pre-V3 HTML, kept for historical/compliance
reference. It is **not served in production**: `server.js` only mounts
`public/` and `public/html/` as static roots, and neither includes this
directory. `tests/v3LegacyHtmlRetirement.test.js` asserts these pages are
archived here (not under `public/html/`) and that their old URLs 301-redirect
to the current V3 SPA routes.

The active, canonical logged-in product is `frontend-v3/` (built to
`public/app-v3/`). Do not wire files from this directory back into routing,
and do not add new product work here — treat this directory as append-only
history unless you're intentionally deleting archived material.
