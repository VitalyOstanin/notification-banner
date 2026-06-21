# 0015 - Also preview the position when the preferences window opens

Status: Accepted (refines [0014](0014-position-preview-via-gsettings-change.md))

## Context

ADR 0014 drives the live position preview from the settings `changed` signal: a
write in `prefs.js` emits `changed` on the shell-side settings object, and the
handler shows a sample banner at the new placement. That previews every *edit*,
but not the initial state. Opening the preferences window writes nothing, so no
`changed` fires and no sample appears until the user changes a setting. The
preview should also appear on open, reflecting the currently configured
placement.

There is no shell-side "prefs window opened" event. The window lives in a
separate process (the `org.gnome.Shell.Extensions` service), and `Gio.Settings`
exposes `changed` only on an actual value write. This was verified empirically on
the dconf backend (the backend the extension uses): rewriting a key with its
current value emits no `changed`; only a real change does. The window-open event
(`Gtk.Widget::map`) is available solely in `prefs.js`, on the
`Adw.PreferencesWindow` passed to `fillPreferencesWindow`.

## Decision

Reuse the existing `changed` channel rather than add a separate IPC mechanism.
Add an internal GSettings key `preview-tick`, not surfaced in the prefs UI. On
the window's `map` signal, `prefs.js` bumps it: `next = (current + 1) % 10`.
Because `(n + 1) % 10 != n` for any `n`, every open writes a different value, so
`changed::preview-tick` always fires; the modulo keeps the stored value bounded
(0..9) instead of growing.

The shell-side `changed` handler special-cases `preview-tick`: it only queues a
preview (`_queuePreview`), without repositioning or redecorating, since the key
is not a real setting. The existing debounce coalesces the burst if `map` fires
more than once during window construction.

`map` is used (not a one-shot flag) because the window is created fresh on every
open: `extensionsService.js` builds a new `ExtensionPrefsDialog` per
`OpenExtensionPrefs` call (guarded to one at a time) and drops it on
`close-request`. So `map` already corresponds to "on open", and a re-show would
harmlessly re-preview.

## Consequences

- The preview appears at the configured placement as soon as the window opens,
  not only after the first edit.
- No new IPC surface: the trigger rides the same GSettings `changed` already used
  for edits, consistent with ADR 0014's rationale for dropping DBus.
- One internal key is added to the schema, deliberately excluded from the prefs
  UI; it carries no user-facing meaning and its value is ignored by the shell.
- Do Not Disturb still suppresses the sample (`show-banners == false`), the same
  as for edit-driven previews.
- The `map` handler is a single read-modify-write on open (one writer, no race).
- ADR 0014 remains in force; this ADR only adds the open-time trigger to the same
  mechanism.
