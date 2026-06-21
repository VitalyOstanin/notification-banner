# 0014 - Position preview via the settings `changed` signal, not DBus

Status: Superseded by [0016](0016-persistent-position-preview.md) (supersedes [0011](0011-position-preview-via-dbus-and-critical-sample.md))

## Context

ADR 0011 drove the live position preview with a DBus interface
(`BeginPreview` / `EndPreview`) plus a persistent CRITICAL sample that the
extension kept alive while the preferences window was open, re-ensuring it via a
`_hideNotificationCompleted` override.

During EGO review the reviewer observed that the DBus export is unnecessary: the
preferences UI and the shell share the same GSettings schema, so a write in
`prefs.js` already emits `changed` on the shell-side settings object. The
extension already relies on this — its `changed` handler repositions whatever
banner is on screen. The DBus surface, the `BeginPreview` / `EndPreview` methods,
the `_previewActive` flag, and the idle re-ensure machinery were extra moving
parts duplicating a signal that already crosses the process boundary.

## Decision

Drive the preview from the settings `changed` signal alone:

- On `changed`, after repositioning and redecorating, show a sample banner at the
  new placement so the edit is previewed. A burst of writes (dragging a spin row)
  is coalesced into one sample with a short `GLib.timeout_add` debounce.
- The sample uses default (NORMAL) urgency, so GNOME auto-hides it on the normal
  banner timeout. No end signal is needed — the preview is self-cleaning. It
  stays `isTransient`, so it never enters notification history.
- Do Not Disturb still suppresses it (`org.gnome.desktop.notifications`
  `show-banners == false`).

Remove the DBus interface and object-path constants, `BeginPreview` /
`EndPreview`, the `prefs.js` DBus client, the `_hideNotificationCompleted`
override, and the persistent-sample re-ensure logic.

## Consequences

- No exported object, no IPC channel, and less shell-side state; the only
  cross-process mechanism is the GSettings change already in use.
- A `prefs.js` crash can no longer leave a stuck banner: the sample auto-hides
  regardless of how the window closes (ADR 0011 relied on `EndPreview` firing on
  `close-request`).
- CRITICAL urgency is no longer used for the sample.
- Trade-off: the preview is no longer a single banner that persists for the whole
  time the window is open; instead each edit re-pops a short-lived sample at the
  new placement. Accepted as the simpler model the review guidance points to.
- `disable()` cancels a pending debounce timeout and destroys any live sample, so
  create/destroy stays symmetric.
