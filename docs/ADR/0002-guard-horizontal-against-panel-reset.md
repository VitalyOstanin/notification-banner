# 0002 - Guard horizontal position against panel.js resets

Status: Accepted

## Context

`js/ui/panel.js` `_updatePanel()` assigns `Main.messageTray.bannerAlignment`
(the banner's `x_align`) based on where the clock (`dateMenu`) sits in the top
panel: `START` if it is in the left box, `END` if in the right box, otherwise
`CENTER`. `_updatePanel()` runs on session-mode changes, lock/unlock and panel
rebuilds. On a default Ubuntu layout the clock is centered, so each run sets the
alignment to `CENTER`.

This means that simply setting `_bannerBin.x_align` once is not durable: GNOME
reverts the horizontal position on the next `_updatePanel()`. The three
`bannerAlignment` assignments in `panel.js` are present on gnome-45 through
gnome-50 (verified). The vertical alignment (`y_align`) is never written by
GNOME.

## Decision

Redefine the `bannerAlignment` accessor on the `MessageTray` prototype in
`enable()`:

- the getter returns `_bannerBin.get_x_align()`;
- the setter ignores its argument and applies the configured horizontal
  alignment instead.

External writers (panel.js) therefore cannot change the horizontal position, and
readers still get a consistent value. `disable()` restores the original property
descriptor. Only the horizontal axis is guarded; the vertical axis is set
directly.

## Consequences

- The configured horizontal position survives lock/unlock and session-mode
  changes.
- `panel.js` also uses `bannerAlignment` to decide when to block banners while a
  same-aligned panel menu is open (`bannerBlocked`). With the guard, that
  comparison uses the configured alignment, so opening a panel menu on the same
  side as the banner suppresses banners while it is open. This is acceptable
  (it avoids overlap) and is the intended upstream behavior, just keyed to the
  configured side.
- The guard depends only on the `bannerAlignment` accessor existing on the
  `MessageTray` prototype (verified 45-50), not on `panel.js` internals such as
  the `_updatePanel` method name.
