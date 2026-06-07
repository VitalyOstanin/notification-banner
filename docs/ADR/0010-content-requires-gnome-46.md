# 0010 - Content/appearance requires GNOME 46+

Status: Accepted

## Context

The content and appearance features depend on the banner's internal widget
structure: `_header` (a `MessageHeader` with the source title and `timeLabel`),
`titleLabel`, `_bodyLabel`, `_icon`, and the style classes `message-header` /
`message-box` / `message-source-icon`. GNOME 46 restructured the notification
message (the `MessageHeader` redesign). Verified on the upstream branches:
`_header` / `_bodyLabel` / `timeLabel` are present in `js/ui/messageList.js` on
`gnome-46` through `gnome-50` but absent on `gnome-45`.

Positioning, by contrast, depends only on `_bannerBin` and the `bannerAlignment`
accessor, which exist on all of 45-50.

## Decision

Keep `shell-version` at 45-50 (positioning works everywhere) and gate the
decoration on the modern structure: `_decorateBanner` returns early unless
`banner._header && banner._bodyLabel` are present. On GNOME 45 the content and
appearance settings are silently inactive; only positioning applies.

This is feature detection, not a version-number check, so it stays correct if the
structure ever changes again.

## Consequences

- A single code base and `shell-version` range; no separate gnome-45 build.
- Documented two-tier compatibility: positioning 45-50, content/appearance 46+.
- If a future version restructures the banner again, the decoration no-ops
  instead of throwing, and the verification procedure (CLAUDE.md) flags which
  widgets moved.
