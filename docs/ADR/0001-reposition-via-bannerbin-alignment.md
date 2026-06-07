# 0001 - Reposition via `_bannerBin` alignment, not body patching

Status: Accepted

## Context

GNOME Shell hard-codes the notification banner to the top-center of the primary
monitor work area. There is no built-in setting and no GSettings key for the
banner position. Existing popular extensions (for example "Notification Banner
Reloaded") move it by taking the source of `MessageTray` methods
(`_showNotification`, `_updateShowingNotification`, `_hideNotification`),
rewriting hard-coded coordinates with a regular expression, and re-evaluating the
modified function back onto the prototype. That approach is tied to the exact
text of those method bodies and breaks silently when GNOME changes them.

Reading `js/ui/messageTray.js` (gnome-50) shows a simpler structure: the banner
is held in `_bannerBin`, a content-sized child of the work-area-sized
`MessageTray` (a `Clutter.BinLayout`). Its `x_align` / `y_align` decide where the
banner sits. GNOME's own `js/ui/panel.js` sets `bannerAlignment` (the `x_align`
of `_bannerBin`) to move the banner under the clock, which confirms that
alignment repositions the banner even though `x_expand` / `y_expand` are true.

## Decision

Position the banner by setting `_bannerBin.x_align` and `_bannerBin.y_align` to
the configured corner/edge. Do not patch the bodies of any GNOME methods and do
not touch the show/hide animation.

`_bannerBin` and the `bannerAlignment` accessor are verified present on
gnome-45 through gnome-50.

## Consequences

- Robust across versions: the extension depends on stable container properties,
  not on the source text of methods that GNOME rewrites between releases.
- The stock show/hide animation is kept (a short slide on the `y` axis). A
  bottom-anchored banner slides in from slightly above its resting spot; changing
  the animation direction would require method overrides and is deliberately out
  of scope for now (see [Limitations](../../README.md#limitations)).
- Relies on the private field name `_bannerBin`; if a future GNOME renames it,
  `enable()` logs an error and does nothing rather than throwing.
