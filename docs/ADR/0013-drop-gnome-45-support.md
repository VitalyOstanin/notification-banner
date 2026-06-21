# 0013 - Drop GNOME 45, support GNOME 46-50

Status: Accepted (supersedes [0006](0006-support-gnome-45-to-50.md))

## Context

ADR 0006 declared support for GNOME 45-50. Two facts make 45 not worth keeping:

- Content and appearance decoration already required GNOME 46+ (ADR 0010),
  because the banner was restructured in 46. On 45 only positioning worked, so
  half the extension was inert there.
- The only 45-specific code was version-distinguishing: the
  `typeof MessageTray.getSystemSource === "function"` branch selecting positional
  vs parameter-object `Source` / `Notification` constructors, and the
  `banner._header && banner._bodyLabel` early-out for the pre-46 banner layout.
  These read as redundant guards and were flagged during EGO review.

The author runs GNOME 50 and no longer needs 45.

## Decision

Declare `shell-version: ["46", "47", "48", "49", "50"]` and remove every
45-only path:

- the sample source is built with a single parameter-object path
  (`new Source({title, iconName})`, `new Notification({...})`,
  `source.addNotification`); the `getSystemSource` feature-detect and the
  positional/`setUrgency`/`setTransient` branch are gone;
- `_decorateBanner` / `_undecorateBanner` no longer early-out on missing
  `_header` / `_bodyLabel`.

Verified against `gnome-shell` branches 46-50 (`git grep`, see CLAUDE.md): the
parameter-object `Source` / `Notification` constructors, `source.addNotification`,
`tray.add`, and the `Message` base class fields `_header` / `_bodyLabel` are
present uniformly, so the removed guards only ever distinguished 45.

## Consequences

- Single-path sample creation and decoration; no version-number or feature-detect
  branching remains.
- ADR 0010 ("content/appearance requires GNOME 46+") now holds for the entire
  supported range, so the requirement is no longer a caveat — it is the floor.
- The verification procedure from ADR 0006 still applies, now over branches
  46-50; adding a future version (for example 51) still requires running it.
