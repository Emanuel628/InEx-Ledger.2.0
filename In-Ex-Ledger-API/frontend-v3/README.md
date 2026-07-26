# InEx Ledger Frontend V3

This is the side-by-side React frontend port from `inex-ledger.3.0`.

Current status:
- Builds into `../public/app-v3`.
- Served by the 2.0 Express app at `/app-v3/`.
- Existing 2.0 frontend files in `public/html`, `public/js`, and `public/css` remain untouched.
- Auth/API wiring is not production-complete yet. The next step is adapting `src/lib/authApi.ts` to the existing 2.0 auth/session endpoints.

Useful commands:

```bash
npm --prefix frontend-v3 run lint
npm --prefix frontend-v3 run build
```
