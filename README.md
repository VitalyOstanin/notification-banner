# Notification Banner

A GNOME Shell extension that repositions the notification banner to any corner or
edge of the primary monitor's work area and customizes its content and
appearance. Every setting defaults to GNOME's stock look, so the extension does
nothing until you configure it.

## Table of Contents

- [What it does](#what-it-does)
- [Settings](#settings)
- [Why a property guard for horizontal position](#why-a-property-guard-for-horizontal-position)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Development](#development)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [License](#license)

## What it does

- Position: anchors the banner at a chosen corner/edge (the GNOME default is
  top-center) with configurable padding.
- Content: hides a notification title that merely repeats the application name,
  keeps newlines in the body, shows the banner expanded immediately, and toggles
  the header timestamp.
- Appearance: toggles the application icon and the large notification icon, and
  overrides the banner width, corner radius, font scale and internal padding.

Notifications otherwise behave as usual: they appear, animate, stay in the tray,
and are clickable.

## Settings

| Setting                  | Values                  | Default | Group      |
| ------------------------ | ----------------------- | ------- | ---------- |
| Horizontal position      | left / center / right   | center  | Position   |
| Vertical position        | top / center / bottom   | top     | Position   |
| Horizontal padding       | 0-400 px                | 0       | Position   |
| Vertical padding         | 0-400 px                | 0       | Position   |
| Hide duplicate title     | on / off                | off     | Content    |
| Keep newlines in body    | on / off                | off     | Content    |
| Show timestamp           | on / off                | on      | Content    |
| Expand immediately       | on / off                | off     | Content    |
| Show application icon     | on / off                | on      | Appearance |
| Show notification icon    | on / off                | on      | Appearance |
| Compact spacing          | on / off                | off     | Appearance |
| Banner width             | 0-2000 px (0 = stock)   | 0       | Appearance |
| Corner radius            | -1-200 px (-1 = stock)  | -1      | Appearance |
| Font scale               | 50-200 % (100 = stock)  | 100     | Appearance |

The defaults reproduce GNOME's stock banner exactly. To put the banner in the
bottom-right, set horizontal to `right`, vertical to `bottom`, and a padding such
as 16.

## Why a property guard for horizontal position

GNOME's own `js/ui/panel.js` (`_updatePanel()`) resets the banner's horizontal
alignment to follow the clock (`dateMenu`) position in the top panel. It runs on
session-mode changes, lock/unlock and panel rebuilds, which would otherwise
revert the configured horizontal position. The extension redefines the
`bannerAlignment` accessor on the `MessageTray` prototype so those external
writes are ignored and the configured horizontal position is kept. The vertical
position is never touched by GNOME and needs no such guard.

## Compatibility

GNOME Shell 45-50.

- Positioning works on 45-50 (it relies on `MessageTray._bannerBin` and the
  `bannerAlignment` accessor, verified present on every branch).
- Content and appearance customization requires the banner structure introduced
  in GNOME 46 (`MessageHeader`, `_bodyLabel`). On GNOME 45 those settings are
  silently inactive and only positioning applies.

The implementation does not patch the bodies of GNOME methods; it reads stable
container/widget properties and decorates each banner after GNOME creates it. See
[CLAUDE.md](CLAUDE.md) for the per-version verification procedure.

## Installation

### From source

```sh
git clone https://github.com/VitalyOstanin/notification-banner.git
ln -s "$(pwd)/notification-banner" \
  ~/.local/share/gnome-shell/extensions/notification-banner@VitalyOstanin
```

Restart GNOME Shell:

- X11: press `Alt+F2`, type `r`, press Enter.
- Wayland: log out and log back in.

Enable it and open the settings:

```sh
gnome-extensions enable notification-banner@VitalyOstanin
gnome-extensions prefs notification-banner@VitalyOstanin
```

## Development

The repository can live anywhere (for example `~/devel/notification-banner`); a
symlink under `~/.local/share/gnome-shell/extensions/` makes GNOME Shell pick it
up.

Check the syntax and compile the settings schema:

```sh
node --check extension.js
node --check prefs.js
glib-compile-schemas schemas/
```

See [CLAUDE.md](CLAUDE.md) for the procedure to verify and update the extension
against new GNOME Shell versions.

## How it works

- `enable()` locates `Main.messageTray._bannerBin`, saves its stock alignment and
  translation, redefines the `bannerAlignment` accessor to enforce the configured
  horizontal position, overrides `_showNotification` to decorate each banner,
  connects to the settings `changed` signal, and applies the current position.
- `_applyPosition()` sets `x_align` / `y_align` on the banner container and sets
  `translation_x` / `translation_y` for padding.
- `_decorateBanner()` runs after GNOME builds a banner. If the modern (46+)
  structure is present, it applies the content and appearance settings: hides the
  duplicate title, re-sets the body keeping newlines, toggles timestamp/icons,
  expands, and applies inline styles for width / radius / font scale / compact
  padding.
- The settings `changed` handler reapplies the position and re-runs the
  (idempotent) banner decoration, so changes show on a banner already on screen.
- `disable()` restores the `_showNotification` override, the `bannerAlignment`
  accessor, the container alignment and translation, disconnects the settings
  handler, and reverts the decoration on a banner still visible at that moment.
  Decorations otherwise live on per-notification banners that are destroyed when
  the notification goes away, so nothing persists.

## Limitations

- The show/hide animation keeps GNOME's stock direction (a short slide on the
  vertical axis). A bottom-anchored banner therefore slides in from slightly
  above its resting spot rather than up from below.
- "Keep newlines in body" shows the full multi-line text when the banner is
  expanded; collapsed banners still clamp the body height (pair it with "Expand
  immediately" to always see the full body).
- Content/appearance settings reapply immediately to a banner already on screen.
  "Expand immediately" is the exception: turning it off does not re-collapse a
  banner GNOME has already expanded.
- Position is applied to the primary monitor work area, as GNOME constrains the
  message tray to the primary monitor.

## License

[GPL-2.0-or-later](LICENSE). GNOME Shell is GPL-2.0-or-later, and extensions are
derived works that must use compatible terms.
