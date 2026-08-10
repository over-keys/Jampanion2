# Integration baselines

This source tree builds one integrated web application from two pinned upstream baselines.

- Jazz Chart Viewer: `over-keys/Jazz-Chart-Viewer` at `d7b3c523aeaac411d0048288e3af48749286a9d3`
- Jampanion: `over-keys/Jampanion` at `d216b4c9658e93347ea42b9fd082900be8bf6d98`

Jazz Chart Viewer owns the chart model, iReal parsing, repeat/navigation expansion,
transposition/spelling and score rendering. Jampanion owns accompaniment generation,
arrangement stages, browser audio, MIDI routing and manual HeadOut/Back-to-head control.
MIDI performance-energy analysis is intentionally not enabled in this integration.

The files under `integration/overlay/` are complete replacement/addition files, not patches.
The build copies the pinned Jazz Chart Viewer into `wwwroot/viewer/`, then builds the
Jampanion runtime around it. No changes are written back to either upstream repository.
