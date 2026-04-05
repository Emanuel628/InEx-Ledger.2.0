## Authentication Contract

This project enforces the authentication contract used by the live frontend bundle in `In-Ex-Ledger-API/public`.

- `/api/me` is the **only** source of truth for session validity.
- `window.API_BASE` (set from `auth.js`) is the canonical base URL for all client API calls.
- Refresh tokens are **not** used during guard checks; no client-side retries or recursive refresh flows exist.
- Guards never short-circuit based on token presence alone; every protected page hits `/api/me` and makes decisions from that response.

Auth-related frontend changes must be applied in `In-Ex-Ledger-API/public`.
