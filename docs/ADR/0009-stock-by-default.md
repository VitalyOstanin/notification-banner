# 0009 - All settings default to the stock look

Status: Accepted

## Context

The extension can change many aspects of the banner (position, padding, title,
body, timestamp, icons, width, radius, font scale, spacing). If any of these
defaulted to a non-stock value, enabling the extension would silently change the
notification appearance before the user configured anything, which is
surprising.

## Decision

Every setting defaults to GNOME's stock behavior:

- position `center` / `top`, padding `0` (stock top-center placement);
- all content toggles off, except `show-timestamp` and the icon toggles which
  default on (matching stock);
- `banner-width 0`, `corner-radius -1`, `font-scale 100`, `compact off` (sentinel
  values that mean "do not override").

Enabling the extension with default settings produces the same banner as stock.
The user opts into each change (for example bottom-right placement) explicitly.

## Consequences

- No visible change on enable; the extension is a no-op until configured.
- The `bannerAlignment` guard is always installed, so on the default
  `horizontal-position: center` it enforces center. On a standard layout (clock
  centered) this equals stock; on a layout where GNOME would align the banner to
  a left/right clock, the default center differs from stock until the user picks
  the matching value. This trade-off keeps the guard simple and is acceptable.
- The sentinel-based numeric defaults (0 / -1 / 100) keep the "no override"
  state representable in plain integer GSettings keys.
