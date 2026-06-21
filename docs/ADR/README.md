# Architecture Decision Records

This directory records the technical decisions made for the
`notification-banner` extension, using a lightweight ADR format
(Context / Decision / Consequences).

## Index

| ID                                                       | Title                                                  | Status   |
| -------------------------------------------------------- | ------------------------------------------------------ | -------- |
| [0001](0001-reposition-via-bannerbin-alignment.md)       | Reposition via `_bannerBin` alignment, not body patching | Accepted |
| [0002](0002-guard-horizontal-against-panel-reset.md)     | Guard horizontal position against panel.js resets      | Accepted |
| [0003](0003-padding-via-translation.md)                  | Apply padding via translation, not margin              | Accepted |
| [0004](0004-uuid-namespace.md)                           | Use `@VitalyOstanin` as the uuid namespace             | Accepted |
| [0005](0005-resource-cleanup-on-disable.md)              | Restore all touched state on disable                   | Accepted |
| [0006](0006-support-gnome-45-to-50.md)                   | Declare and verify support for GNOME 45-50             | Superseded by [0013](0013-drop-gnome-45-support.md) |
| [0007](0007-scope-and-name.md)                           | Scope and name without `-position` suffix              | Accepted |
| [0008](0008-decorate-via-show-notification.md)           | Decorate banners via a `_showNotification` override    | Accepted |
| [0009](0009-stock-by-default.md)                         | All settings default to the stock look                 | Accepted |
| [0010](0010-content-requires-gnome-46.md)                | Content/appearance requires GNOME 46+                  | Accepted |
| [0011](0011-position-preview-via-dbus-and-critical-sample.md) | Live position preview via DBus and a CRITICAL sample | Superseded by [0014](0014-position-preview-via-gsettings-change.md) |
| [0012](0012-suppress-banners-only-for-the-notification-list.md) | Suppress banners only for the notification list      | Accepted |
| [0013](0013-drop-gnome-45-support.md)                    | Drop GNOME 45, support GNOME 46-50                     | Accepted |
| [0014](0014-position-preview-via-gsettings-change.md)    | Position preview via the settings `changed` signal     | Accepted |
| [0015](0015-preview-on-prefs-window-open.md)             | Also preview the position when the prefs window opens  | Accepted |
