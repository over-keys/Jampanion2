# Source provenance

Jampanion2 is now a self-contained repository. Its build and deployment do not
clone, pin, fetch, or overlay either of the earlier application repositories.

For historical traceability only, the initial standalone source snapshot was
materialized from the previously pinned integration state:

- accompaniment/web baseline commit: `d216b4c9658e93347ea42b9fd082900be8bf6d98`
- chart-viewer baseline commit: `1457dde2a133987237a7f3c50800a32dcea00033`
- MuseJazzText source: MuseScore commit `c1ad658dec3f29ef7e089a5915c7eed91a7e5349`,
  Git blob `9d83c39a16054cb20b1827c414eb67cc97cbe9c4` (OFL license retained in the Viewer licenses directory)

All Jampanion2 behavior after this migration is maintained directly under
`src/` in this repository. These commit IDs are provenance records, not build
dependencies.
