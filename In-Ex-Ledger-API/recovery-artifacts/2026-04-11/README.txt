Quarantined recovery artifacts from 2026-04-11.

Contents:
- `fix_001.js` and `fix_checksum.js` hardcode stale checksum values.
- `fix_all_checksums.js` rewrites DB checksums from the working tree and can bless drift.
- `fix_checksums_from_git.js` is safer than the others, but not needed after the checksum audit passed.
- `server.js.bak` differs from `server.js` only by encoding/comment character noise.
- `-20260411` is an accidental capture of `less` help output.

These files were moved here to prevent accidental execution.
