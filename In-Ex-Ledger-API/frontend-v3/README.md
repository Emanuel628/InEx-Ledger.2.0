# InEx Ledger Frontend V3

This is the side-by-side React frontend port from `inex-ledger.3.0`.

Current status:
- Builds into `../public/app-v3`.
- Served by the 2.0 Express app at canonical `/app-v3` and `/app-v3/<page-slug>` routes.
- Uses the existing 2.0 auth/session, CSRF, billing, business, transaction, category, receipt, export, message, settings, and MFA endpoints.
- Private `/app-v3/<page-slug>` routes preserve the requested URL through legacy `login?next=`.
- Transactions use API-backed pagination and filter query params instead of loading a local mock list.
- Existing 2.0 frontend files in `public/html`, `public/js`, and `public/css` remain in the repo until each migrated page is verified and explicitly retired.

Legacy UI retirement rule:
- Do not delete a legacy HTML page just because a v3 page exists.
- First confirm the v3 page has route coverage, API wiring, empty/error/loading states, and a smoke pass.
- Then redirect the legacy page to the canonical v3 route and remove the old page in a separate cleanup commit.

Useful commands:

```bash
npm --prefix frontend-v3 run lint
npm --prefix frontend-v3 run build
```
