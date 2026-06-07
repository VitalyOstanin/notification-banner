# 0003 - Apply padding via translation, not margin

Status: Accepted

## Context

The banner should not sit flush against the screen edge; a configurable gap
(padding) is wanted between the banner and the anchored edges. There are a few
ways to offset an actor:

- `margin_top` / `margin_bottom` / `margin_left` / `margin_right` — change the
  actor's allocation. They interact with the layout and with the show/hide
  animation, which eases `_bannerBin.y` from `-height` to `0` and back; mixing an
  allocation-affecting margin with a directly animated `y` risks conflicts on
  reallocation.
- `translation_x` / `translation_y` — a paint-time offset applied after layout.
  It does not change the allocation and is independent of the `y` animation.

`translation-x` / `translation-y` are `Clutter.Actor` properties present on
gnome-45 through gnome-50 (verified).

## Decision

Apply padding with `_bannerBin.translation_x` / `translation_y`. The offset
points inward from the anchored edge: positive for `left` / `top`, negative for
`right` / `bottom`, zero for a centered axis. The stock `y` animation is left
untouched and simply runs offset by the translation.

## Consequences

- Padding is decoupled from layout and animation, so it cannot interfere with the
  banner's show/hide motion.
- `disable()` restores the original `translation_x` / `translation_y` values.
- Padding is uniform per axis (one horizontal value, one vertical value); there
  is no separate per-edge padding, which matches the single-corner positioning
  model.
