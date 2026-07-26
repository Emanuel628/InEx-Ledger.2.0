# InEx Ledger Frontend V3

React product UI for InEx Ledger 2.0.

Current status:
- Builds into `../public/app-v3` (asset prefix `/app-v3/assets/...`).
- **Canonical page URLs are bare paths:** `/transactions`, `/settings`, `/billing`, etc.
- Deprecated `/app-v3` and `/app-v3/<page>` **301 redirect** to the bare path. Do not treat `/app-v3/*` as a second product home.
- Uses the existing 2.0 auth/session, CSRF, billing, business, transaction, category, receipt, export, message, settings, and MFA endpoints.
- Private routes preserve the requested URL through legacy `login?next=` using bare paths.
- Transactions use API-backed pagination and filter query params.
- Existing 2.0 frontend files in `public/html`, `public/js`, and `public/css` remain until each migrated page is verified and explicitly retired.

See `Docs/V3_ROUTE_INVENTORY.md` for the freeze/map and stop rules.
- Builds into `../public/app-v3`.
- Served by the 2.0 Express app at canonical bare routes such as `/transactions`, `/accounts`, and `/settings`.
- Uses the existing 2.0 auth/session, CSRF, billing, business, transaction, category, receipt, export, message, settings, and MFA endpoints.
- Old `/app-v3` page URLs are redirects only. Built assets can still load from `/app-v3/assets`.
- Private app routes preserve the requested bare URL through legacy `login?next=`.
- Transactions use API-backed pagination and filter query params instead of loading a local mock list.
- Existing 2.0 frontend files in `public/html`, `public/js`, and `public/css` remain in the repo until each migrated page is verified and explicitly retired.


Legacy UI retirement rule:
- Do not delete a legacy HTML page just because a v3 page exists.
- First confirm the v3 page has route coverage, API wiring, empty/error/loading states, and a smoke pass.
- Then redirect the legacy page to the canonical bare route and remove the old page in a separate cleanup commit.

Useful commands:

```bash
npm --prefix frontend-v3 run lint
npm --prefix frontend-v3 run build
```
