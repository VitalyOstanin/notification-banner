# 0011 - Live position preview via DBus and a transient CRITICAL sample

Status: Accepted

## Context

The preferences window lets the user set the banner position (corner/edge and
paddings). Without feedback the user cannot see where a banner will land until
the next real notification arrives. The goal: while the preferences window is
open, a banner is always visible on screen — a real one if present, otherwise a
sample — so the position and any change to it are seen immediately.

Two obstacles shape the design:

- The preferences UI runs in a separate process (`gjs` running `prefs.js`), with
  no access to `Main.messageTray`. Only the extension, running inside the
  gnome-shell process, can put a banner on screen.
- A normal notification banner auto-hides after `NOTIFICATION_TIMEOUT` (4 s) and
  would be recorded in the notification history. A preview banner must do
  neither: it must stay until the window closes and must not pollute history.

## Decision

**Cross-process trigger over DBus.** The extension exports a small interface
`org.gnome.Shell.Extensions.NotificationBanner` (object path
`/org/gnome/Shell/Extensions/NotificationBanner`) with two methods,
`BeginPreview` and `EndPreview`. Because the extension lives in the gnome-shell
process, the object is reachable under the well-known name `org.gnome.Shell`.
`prefs.js` calls `BeginPreview` when the window opens and `EndPreview` on
`close-request`. The call is best-effort: if the extension is disabled or not
exporting, the failure is swallowed and the window is unaffected. No GSettings
key is involved — the trigger is the window lifecycle, not a stored value.

**Invariant maintained shell-side.** `BeginPreview` sets `_previewActive` and
calls `_ensureSample()`, which creates a sample only when no banner is currently
on screen (`Main.messageTray._banner == null`) and Do Not Disturb is off. When a
real banner is present, nothing is created — the extension's existing settings
`changed` handler already repositions whatever banner is on screen, so position
changes are live regardless of which banner it is. When any banner disappears,
the overridden `_hideNotificationCompleted` re-runs `_ensureSample()` on the next
GLib idle tick (deferred to avoid re-entering the tray state machine from inside
its own hide-completion code), so the invariant is re-established.

**Transient CRITICAL sample.** The sample is created with `isTransient = true`
and `urgency = CRITICAL`. These two properties are independent: `isTransient`
keeps the sample out of the notification history, while `CRITICAL` urgency is the
only urgency that is not auto-hidden, so the sample stays until `EndPreview`
destroys it. The sample flows through the same `_showNotification` override as
real banners, so positioning (and, on 46+, decoration) apply to it automatically.

**Version-branched creation.** The MessageTray `Source` / `Notification`
constructors changed between GNOME 45 and 46+. Following ADR 0006's feature-
detection rule, the branch is selected by `typeof MessageTray.getSystemSource
=== "function"` (true on 46+), not by version number: 46+ uses parameter-object
constructors plus `source.addNotification`; 45 uses positional constructors plus
`setTransient` / `setUrgency` and `source.showNotification`.

**Real notifications queue, no yield logic.** A real notification arriving while
the CRITICAL sample is on screen queues behind it (standard tray behavior) and is
shown after the window closes and the sample is destroyed. This is accepted as-is:
no logic yields the sample to incoming real notifications, keeping the preview
simple and the invariant unbroken.

## Consequences

- The preview needs no schema change and no new persisted state; it is purely a
  function of the prefs window being open.
- The DBus object is exported only after the banner container is located in
  `enable()`, and `disable()` unexports it, destroys any live sample, and cancels
  a pending idle — so export/unexport and create/destroy stay symmetric.
- The `_hideNotificationCompleted` override is removed by the existing
  `InjectionManager.clear()` in `disable()`, like the `_showNotification`
  override; no separate teardown is needed.
- Under Do Not Disturb (`org.gnome.desktop.notifications` `show-banners == false`)
  GNOME shows no banners at all, so the preview creates none — the window simply
  shows no sample, matching the user's DND choice.
- A real banner already on screen when the window opens is reused; the sample
  only appears once that banner finishes hiding.
