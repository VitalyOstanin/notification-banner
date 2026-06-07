# 0005 - Restore all touched state on disable

Status: Accepted

## Context

GNOME Shell extensions must fully undo their effects in `disable()`: the same
shell process stays alive, and the extension is disabled on lock screen and
re-enabled afterwards. Anything left behind (a redefined prototype property, a
modified actor, a live signal handler) leaks across enable/disable cycles and
across the lock screen.

This extension mutates global shell state in four ways: it redefines the
`bannerAlignment` accessor on the `MessageTray` prototype, it changes
`_bannerBin` alignment and translation, it connects to the settings `changed`
signal, and it decorates the per-notification banner (visibility and inline
styles on `titleLabel` / `_header.timeLabel` / icons / the banner root / the
header and content boxes). A banner can still be on screen at `disable()` time.

## Decision

In `enable()`, capture the original state before changing it: the
`bannerAlignment` property descriptor and the container's `x_align`, `y_align`,
`translation_x`, `translation_y`. In `disable()`, reverse every change:

1. disconnect the settings handler;
2. remove the `_showNotification` override (`InjectionManager.clear()`);
3. restore the original `bannerAlignment` descriptor (or delete the override if
   there was none);
4. restore the container's alignment and translation;
5. revert the decoration on a banner still on screen (`_undecorateBanner`),
   resetting it to the stock look directly since the settings are about to be
   released.

The banner is short-lived (GNOME destroys it when the notification hides) and new
banners are no longer decorated once the override is gone, so step 5 only has to
restore the single banner that may be visible at `disable()` time. The body
newline change is reverted to the stock collapsed form to match GNOME's own
`set body`.

## Consequences

- No leakage across enable/disable cycles or the lock screen, including a banner
  that happens to be visible when the extension is disabled.
- After disable, GNOME's next `panel.js` `_updatePanel()` recomputes the
  horizontal alignment, so the banner returns to stock behavior even though the
  restore writes the alignment captured at enable time.
- `enable()` bails out cleanly (logging an error, leaving nothing to undo) if the
  banner container cannot be located.
