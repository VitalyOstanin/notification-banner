# 0017 - Guard `_decorateBanner` against a stale override after disable

Status: Accepted

## Context

The extension decorates banners from a `_showNotification` override (ADR
[0008](0008-decorate-via-show-notification.md)), whose callback reads
`this._settings`. `enable()` sets `_settings` before installing the override and
`_teardown()` clears the InjectionManager before nulling `_settings`, so on its
own the override never runs with null settings.

It does not run on its own when a second extension also wraps
`_showNotification`. `InjectionManager` cannot unwrap the inner reference that an
outer wrapper (installed later, by another extension) keeps: disabling this
extension restores the prototype, but the outer wrapper still calls this
extension's now-orphaned callback, whose captured instance has had `_settings`
nulled by `_teardown()`.

This was observed live on GNOME 50 (Wayland) during screen unlock, with
`mute-banners-timer` co-installed as the outer wrapper. On the session-mode
transition `MessageTray._sessionUpdated` -> `_updateState` -> `_showNotification`
ran the stale chain; `_decorateBanner` dereferenced null `_settings` and threw
`TypeError: settings is null`. Because the throw landed inside
`_updateState()` — whose `_updatingState` reentrancy guard is set true and reset
false with no `try/finally` around it — the guard stuck true and froze the whole
message tray (the banner would not close, no new banners appeared) until relogin.
A co-installed mute control was also missing from that banner, a side effect of
the same throw aborting the outer wrapper's post-show hook.

## Decision

Return early from `_decorateBanner` when `_settings` (or the banner) is null, so a
stale post-disable call is a no-op instead of a throw. This extends the existing
`if (!banner) return;` null-guard on the same line to `if (!banner || !settings)
return;`.

## Consequences

- A stale override firing during teardown or a session-mode transition can no
  longer throw, so it can no longer trip GNOME's `_updateState` freeze or drop a
  co-installed extension's banner decoration.
- The guard is justified by a reproduced crash (stack trace), not a blind
  existence check on an API guaranteed across the supported versions; it is
  explainable on review if questioned.
- It does not fix the underlying GNOME fragility (no `try/finally` around
  `_updateState`'s guard); it only avoids being the code that triggers it. A
  cross-extension `InjectionManager` ordering hazard cannot be fully resolved from
  one extension, so a defensive no-op is the appropriate mitigation.
