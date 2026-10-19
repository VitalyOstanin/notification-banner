# 0018 - Opt-in hold for panel menus on the banner's side

Status: Accepted (extends [0012](0012-suppress-banners-only-for-the-notification-list.md))

## Context

ADR [0012](0012-suppress-banners-only-for-the-notification-list.md) made the
`bannerAlignment` getter return `Clutter.ActorAlign.FILL`, so `panel.js` never
holds banners for a menu on the banner's side, and keyed suppression to the
notification list (`dateMenu`) instead. That fixed unrelated menus hiding
banners, but it also removed a side effect some layouts relied on: with the
banner moved to a corner next to a panel menu (for example bottom-right with a
bottom panel and Quick Settings open), a new banner and the open menu can now
overlap. Under ADR [0002](0002-guard-horizontal-against-panel-reset.md) the
getter returned the banner's side (`END`), and the open menu held the banner
back. This was reported in issue
[#1](https://github.com/VitalyOstanin/notification-banner/issues/1).

Both behaviours are valid for different users: one does not want an unrelated
menu to delay notifications, the other does not want a banner drawn over the
menu being used.

## Decision

Add a boolean setting `hold-for-same-side-menus`, off by default:

- Off: the getter returns `FILL`, exactly as in ADR 0012.
- On: the getter returns the configured horizontal side (`START` / `CENTER` /
  `END` from `horizontal-position`). `panel.js` `_onMenuSet()` compares it with
  each indicator's panel box on every `open-state-changed`, so menus in the box on
  the banner's side hold banners while open. The getter reads the settings on
  each call, so toggling the option or changing the side takes effect on the next
  menu open without re-wiring anything.

The `dateMenu` suppression of ADR 0012 stays in both modes. With the option on
and a centered banner, the `dateMenu` is also matched by `panel.js`; both writes
set the same value, so the double write is harmless.

## Consequences

- Defaults are unchanged and still stock (ADR
  [0009](0009-stock-by-default.md)): with a centered banner and the option off,
  only the notification list holds banners, as in GNOME.
- dash-to-panel panels are covered: dash-to-panel routes its panels'
  `_onMenuSet` through `Main.panel._onMenuSet`, which reads
  `Main.messageTray.bannerAlignment` and compares with that panel's own boxes.
- The match is by panel box, not by screen geometry: on a vertical
  dash-to-panel panel the left/right boxes do not map to the banner's left/right
  side. This is the same limitation upstream GNOME has.
- If the option or the side changes while a matching menu is open, `panel.js`
  compares the new value on close and may leave `bannerBlocked` set. An open
  panel menu holds a modal grab (`PopupMenuManager._onMenuOpenState` calls
  `Main.pushModal`, gnome-46 through gnome-50), so the preferences window cannot
  be used at that moment; no extra handling is added.
- Disabling the extension while a same-side menu is open restores the stock
  getter, so `panel.js` no longer matches that menu on close and would leave
  `bannerBlocked` set until relogin. `disable()` therefore lifts the block when
  the option is on, as it already does for an open `dateMenu`. Only `panel.js`
  writes `bannerBlocked` in gnome-46 through gnome-50, so no other block is
  lifted by mistake.
- Verified on gnome-46 through gnome-50: `panel.js` `_onMenuSet()` reads
  `Main.messageTray.bannerAlignment` inside the `open-state-changed` handler.
