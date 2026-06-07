# 0008 - Decorate banners via a `_showNotification` override

Status: Accepted

## Context

Content and appearance customization (hide duplicate title, keep body newlines,
toggle timestamp/icons, expand, width/radius/font/compact) needs to act on the
banner widget. GNOME builds a fresh `NotificationMessage` for every notification
in `MessageTray._showNotification()` (`this._banner = new MessageList.NotificationMessage(...)`).
A static `stylesheet.css` can restyle classes but cannot express conditional
logic (for example "hide the title only when it equals the app name") or runtime
values from settings, and it cannot reach private widgets cleanly.

## Decision

Override `MessageTray.prototype._showNotification` with `InjectionManager`: call
the original, then run `_decorateBanner(this)` on the just-created
`this._banner`. Decoration reads the current settings and:

- toggles widget visibility (`titleLabel`, `_header.timeLabel`, app icon,
  `_icon`);
- re-sets the body markup, keeping or collapsing newlines;
- calls `_expandBanner(true)` to expand;
- applies inline `set_style` for width / corner radius / font scale / compact
  padding.

`_decorateBanner` is idempotent: each property is set from the current setting in
both directions (visible/hidden, style/no-style, newlines kept/collapsed), so
re-running it fully reflects the current configuration rather than only adding
changes. This lets the settings `changed` handler re-run it on the banner already
on screen for immediate feedback. The one exception is "Expand immediately",
which is monotonic — it can expand but does not re-collapse.

Styling is done with per-banner inline styles rather than a generated global
stylesheet, because each banner is short-lived and freshly created.

## Consequences

- One hook covers all content and appearance features; they compose on the same
  freshly built banner.
- Because decoration is idempotent, the `changed` handler reapplies it to the
  banner currently on screen, so settings changes show immediately (the
  positioning settings already applied instantly).
- No GNOME method body is patched; the override calls the original unchanged and
  only post-processes its result.
- `disable()` removes the override via `InjectionManager.clear()` and reverts the
  decoration on a banner still visible at that moment via `_undecorateBanner`
  (a direct reset to the stock look, since settings are about to be released).
  Decorations otherwise vanish with the per-notification banners GNOME destroys.
