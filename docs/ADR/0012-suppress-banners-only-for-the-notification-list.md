# 0012 - Suppress banners only for the notification list

Status: Accepted (supersedes the banner-suppression consequence of ADR 0002)

## Context

`js/ui/panel.js` `_onMenuSet()` connects every panel indicator's menu and, while
it is open, sets `Main.messageTray.bannerBlocked` when that indicator's box
alignment equals `Main.messageTray.bannerAlignment`. Upstream this hides the
transient banner while the notification list (the `dateMenu` dropdown) is open:
on the stock layout the banner and the clock are both centered, so the comparison
singles out the `dateMenu`, whose dropdown already shows the same notification.

ADR 0002 redefined the `bannerAlignment` getter to return the configured banner
side. As a side effect (recorded there as an accepted consequence), the panel's
comparison then matched whatever indicator sits on the banner's side rather than
the `dateMenu`. With the banner moved to a corner, opening an unrelated panel
menu on that side (for example a clipboard manager in the right box) suppressed
banners, while the `dateMenu` itself — possibly on another side, or moved out of
the standard boxes entirely by dash-to-panel — no longer triggered suppression.
The suppression had become keyed to a panel side instead of to the menu that
actually shows the notifications.

## Decision

Decouple the suppression decision from the banner's display side and key it to
the notification list instead:

- The `bannerAlignment` getter returns `Clutter.ActorAlign.FILL`, which matches
  no panel box (`START`/`CENTER`/`END`), so `panel.js` never suppresses banners
  for any same-side menu. The actual banner position is unaffected: it is set
  directly on `_bannerBin.x_align`, and the setter guard of ADR 0002 stays as is.
- The extension connects the `dateMenu` menu's `open-state-changed` and sets
  `Main.messageTray.bannerBlocked` to the open state. Suppression now happens
  exactly while the notification list is open, regardless of panel layout — it
  works even when dash-to-panel moves the clock out of the standard panel boxes,
  because it is keyed to the menu, not to geometry.

The write goes through the `bannerBlocked` accessor, so it cooperates with a mute
guard layered on it by another extension (e.g. `mute-banners-timer`, whose setter
keeps an active mute regardless of these writes).

## Consequences

- Opening an unrelated panel menu on the banner's side no longer hides banners.
- The notification list still suppresses the redundant transient banner while it
  is open, matching upstream intent.
- The `bannerAlignment` getter no longer reports the banner's real alignment. Its
  only reader is `panel.js`, for the suppression comparison, so this is internal;
  code needing the real position reads `_bannerBin.x_align`.
- The hook targets the primary panel's `dateMenu`. A dash-to-panel secondary
  panel with its own clock is not covered; this is acceptable, as the banner is
  on the primary monitor.
- Depends on `Main.panel.statusArea.dateMenu.menu` emitting `open-state-changed`
  (a `PanelMenu.Button` menu), verified present on gnome-45 through gnome-50.
