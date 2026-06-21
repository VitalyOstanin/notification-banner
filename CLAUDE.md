# CLAUDE.md

Guidance for AI agents and contributors working on this extension.

## Table of Contents

- [Project overview](#project-overview)
- [Hard constraint: GNOME 46-50](#hard-constraint-gnome-46-50)
- [API surface used](#api-surface-used)
- [Positioning model](#positioning-model)
- [Banner decoration model](#banner-decoration-model)
- [Banner structure across 46-50](#banner-structure-across-46-50)
- [Procedure: verify against a GNOME version](#procedure-verify-against-a-gnome-version)
- [Procedure: add support for a new GNOME version](#procedure-add-support-for-a-new-gnome-version)
- [Syntax check and schema](#syntax-check-and-schema)
- [Manual testing](#manual-testing)
- [Files](#files)

## Project overview

`notification-banner` repositions the GNOME Shell notification banner and
customizes its content and appearance. The rationale for each approach
(alignment + translation, the `bannerAlignment` guard, the `_showNotification`
decoration hook, stock-by-default settings) is recorded in
[docs/ADR](docs/ADR). Read the ADRs before changing how
the banner is positioned or decorated.

The name omits a `-position` suffix because it also covers content/appearance
(see [docs/ADR/0007-scope-and-name.md](docs/ADR/0007-scope-and-name.md)).

## Hard constraint: GNOME 46-50

`metadata.json` declares `shell-version` 46 through 50. Every change MUST keep
the extension working across all of them. GNOME's API is not stable across major
versions, so any use of a Meta/Shell/Clutter/St symbol must be verified against
each declared version. Do not assume a symbol exists just because it works on the
locally installed version.

Both positioning and content/appearance decoration target GNOME 46-50; the
banner structure used for decoration was introduced in GNOME 46.

## API surface used

| Symbol                                            | Source       | Tier      | Notes                                            |
| ------------------------------------------------- | ------------ | --------- | ------------------------------------------------ |
| `Extension`, `InjectionManager`, `getSettings()`  | gnome-shell  | 46-50     | `js/extensions/extension.js` (ESM extensions)    |
| `Main.messageTray`                                | gnome-shell  | 46-50     | singleton, `js/ui/main.js`                       |
| `MessageTray._bannerBin`                          | gnome-shell  | 46-50     | private banner container                         |
| `MessageTray.prototype` `bannerAlignment` accessor| gnome-shell  | 46-50     | setter guards x_align (position); getter returns FILL to disable side-based banner suppression (ADR 0012) |
| `Main.panel.statusArea.dateMenu.menu`             | gnome-shell  | 46-50     | `open-state-changed` drives banner suppression (ADR 0012) |
| `MessageTray.prototype` `bannerBlocked` accessor  | gnome-shell  | 46-50     | written (not redefined) to suppress while the list is open |
| `MessageTray.prototype._showNotification`         | gnome-shell  | 46-50     | overridden to decorate `this._banner`            |
| `MessageTray._banner` / `_notification` / `_expandBanner` | gnome-shell | 46-50 | banner instance, source notification, expand call |
| `St.Widget` `x_align`/`y_align`, `translation_x/y` | mutter      | 46-50     | `Clutter.ActorAlign`, paint-time offset          |
| banner `titleLabel` / `_bodyLabel` / `_header.timeLabel` / `_icon` | gnome-shell | 46-50 | content widgets (`js/ui/messageList.js`) |
| `_bodyLabel.setMarkup(text, allowMarkup)`         | gnome-shell  | 46-50     | re-set body keeping newlines                     |
| style classes `message-source-icon` / `message-header` / `message-box` | gnome-shell | 46-50 | found via `has_style_class_name` |
| `MessageTray.Source` / `Notification`             | gnome-shell  | 46-50     | preview sample on settings change; params-object constructors, default (NORMAL) urgency auto-hides |
| `GLib.timeout_add` / `source_remove`              | glib         | 46-50     | debounce a burst of setting writes into one sample |
| `org.gnome.desktop.notifications` `show-banners`  | gsettings    | 46-50     | DND detection (no preview sample under DND)       |
| `Adw.PreferencesWindow` `map` / `close-request`   | gtk          | 46-50     | prefs.js sets the internal `preview-active` key and pulses `preview-tick` while open (ADR 0016) |
| `MessageTray.Urgency.CRITICAL`                    | gnome-shell  | 46-50     | persistent preview sample stays on screen while the prefs window is open (ADR 0016) |

## Positioning model

Verified against `js/ui/messageTray.js` (gnome-50) and `_bannerBin` /
`bannerAlignment` presence on 46-50:

- `MessageTray` is constrained to the primary monitor work area and uses a
  `Clutter.BinLayout`. `_bannerBin` is a content-sized child whose `x_align` /
  `y_align` position the banner. `panel.js` itself sets `bannerAlignment`
  (= `_bannerBin` x_align), proving alignment repositions the banner.
- The show/hide animation eases `_bannerBin.y`; padding uses `translation_x/y`
  precisely because translation is independent of that `y` animation.
- `panel.js` `_updatePanel()` resets `bannerAlignment` (3 assignments,
  dateMenu-driven) on every supported version, so the extension redefines the
  `bannerAlignment` accessor on the `MessageTray` prototype to keep the
  configured horizontal value. Vertical alignment is never touched by GNOME.

## Banner decoration model

A fresh `NotificationMessage` is created per notification in
`MessageTray._showNotification()` (`this._banner = new ...`). The extension
overrides `_showNotification` (via `InjectionManager`), calls the original, then
decorates `this._banner`:

- content: hide `titleLabel` when `banner.title === notification.source.title`;
  re-set `_bodyLabel.setMarkup(notification.body, useMarkup)` to keep newlines;
  hide `_header.timeLabel`; call `_expandBanner(true)`;
- appearance: hide the app icon (found by style class `message-source-icon`) and
  `_icon`; apply inline `set_style` on the banner root for width / border-radius
  / font-size percentage.

Decorations live on per-notification banners that GNOME destroys, so nothing
needs explicit cleanup beyond removing the `_showNotification` override in
`disable()`.

## Banner structure across 46-50

The relevant API is uniform across the supported range:

| Aspect                                        | GNOME 46-50                        |
| --------------------------------------------- | ---------------------------------- |
| `_bannerBin`, `bannerAlignment`               | present                            |
| `panel.js` resets `bannerAlignment`           | yes                                |
| banner `_header` / `_bodyLabel` / `timeLabel` | present (`MessageHeader` redesign) |

GNOME 45 is not supported: its `messageList.js` has a different widget structure
(`_header` / `_bodyLabel` / `timeLabel` absent), and `getSystemSource` and the
params-object `Source` / `Notification` constructors were introduced in 46.

## Procedure: verify against a GNOME version

Upstream sources are checked out locally (full clones with `gnome-46` …
`gnome-50` branches):

- `/home/vyt/devel/gnome/gnome-shell`
- `/home/vyt/devel/gnome/mutter`

Use `git grep <ref>` without switching the working tree:

```sh
cd /home/vyt/devel/gnome/gnome-shell
# positioning symbols
for v in 46 47 48 49 50; do
  echo "=== gnome-$v ==="
  git grep -nE '_bannerBin|get bannerAlignment' origin/gnome-$v -- js/ui/messageTray.js | head
done
# banner content structure
for v in 46 47 48 49 50; do
  echo "=== gnome-$v ==="
  git grep -nE 'this\._header|_bodyLabel|timeLabel' origin/gnome-$v -- js/ui/messageList.js | head
done
# panel horizontal reset
git grep -n 'Main.messageTray.bannerAlignment =' origin/gnome-50 -- js/ui/panel.js
```

To read whole files for a version, switch detached: `git switch --detach gnome-50`.
Update the checkouts with `git fetch --all --tags`.

## Procedure: add support for a new GNOME version

1. Confirm the `gnome-XX` branch exists in both `gnome-shell` and `mutter`.
2. Run the verification procedure for every symbol in
   [API surface used](#api-surface-used), keeping the two tiers separate.
3. Re-confirm the [Positioning model](#positioning-model) and
   [Banner decoration model](#banner-decoration-model) (especially that the
   content widgets and style classes still exist).
4. Adapt the code with feature detection (not version-number branching) and
   record any change in a new ADR.
5. Add the version to `shell-version` in `metadata.json` and update the tables.
6. Run the syntax check, compile the schema, and do a manual test.

## Syntax check and schema

```sh
node --check extension.js
node --check prefs.js
glib-compile-schemas schemas/
```

`node --check` validates ESM syntax without resolving `gi://` imports.

## Manual testing

1. Symlink the repo into `~/.local/share/gnome-shell/extensions/`.
2. Restart GNOME Shell (X11: `Alt+F2`, `r`, Enter; Wayland: re-login).
3. `gnome-extensions enable notification-banner@VitalyOstanin`.
4. With default settings, confirm the banner looks exactly like stock
   (top-center, no changes).
5. Open the settings (`gnome-extensions prefs ...`). Set bottom-right with
   padding; trigger `notify-send "Test" "Body"` and confirm placement.
6. Toggle content/appearance settings and trigger new notifications; confirm
   each takes effect (dedupe title, multiline body when expanded, hidden
   timestamp/icons, width/radius/font scale).
7. Lock and unlock the session; confirm the horizontal position is kept (the
   `bannerAlignment` guard).
8. Check `journalctl -b /usr/bin/gnome-shell -p warning` for extension errors.

## Files

- `extension.js` — positioning, the `bannerAlignment` guard, and the
  `_showNotification` decoration hook.
- `prefs.js` — Adwaita preferences (Position / Content / Appearance groups).
- `metadata.json` — uuid, name, description, `shell-version`, `settings-schema`.
- `schemas/` — GSettings schema for all settings.
- `stylesheet.css` — placeholder; styling is applied from JS, not from here.
- `docs/ADR/` — architecture decision records.
