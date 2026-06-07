# 0005 - Restore all touched state on disable

Status: Accepted

## Context

GNOME Shell extensions must fully undo their effects in `disable()`: the same
shell process stays alive, and the extension is disabled on lock screen and
re-enabled afterwards. Anything left behind (a redefined prototype property, a
modified actor, a live signal handler) leaks across enable/disable cycles and
across the lock screen.

This extension mutates global shell state in three ways: it redefines the
`bannerAlignment` accessor on the `MessageTray` prototype, it changes
`_bannerBin` alignment and translation, and it connects to the settings `changed`
signal.

## Decision

In `enable()`, capture the original state before changing it: the
`bannerAlignment` property descriptor and the container's `x_align`, `y_align`,
`translation_x`, `translation_y`. In `disable()`, reverse every change:

1. disconnect the settings handler;
2. restore the original `bannerAlignment` descriptor (or delete the override if
   there was none);
3. restore the container's alignment and translation.

## Consequences

- No leakage across enable/disable cycles or the lock screen.
- After disable, GNOME's next `panel.js` `_updatePanel()` recomputes the
  horizontal alignment, so the banner returns to stock behavior even though the
  restore writes the alignment captured at enable time.
- `enable()` bails out cleanly (logging an error, leaving nothing to undo) if the
  banner container cannot be located.
