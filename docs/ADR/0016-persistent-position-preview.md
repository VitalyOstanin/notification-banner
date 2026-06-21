# 0016 - Persistent position preview while the preferences window is open

Status: Accepted (supersedes [0014](0014-position-preview-via-gsettings-change.md), [0015](0015-preview-on-prefs-window-open.md))

## Context

ADR 0014 drove the preview from the GSettings `changed` signal with a NORMAL,
self-hiding sample; ADR 0015 added a trigger so a sample also appears when the
window opens. In use the self-hiding sample is a poor preview: it flashes for a
few seconds and disappears, so the placement is not visible while the user is
actually adjusting settings.

The EGO review that prompted ADR 0014 ([review 72040](https://extensions.gnome.org/review/72040))
objected specifically to the DBus export and to unnecessary defensive checks —
not to the sample being persistent or CRITICAL. A persistent preview is therefore
compatible with that review as long as it stays on the GSettings channel and adds
no unnecessary machinery.

GNOME keeps a banner on screen without auto-hiding only when its urgency is
CRITICAL: verified in `messageTray.js` `_showNotificationCompleted`, uniform
across 46-50, a hide timeout is armed only for non-CRITICAL urgency. A NORMAL
banner would require continuously re-arming a private hide timeout to stay
visible; CRITICAL needs none of that.

## Decision

Show a persistent preview while the preferences window is open, driven entirely
over GSettings:

- Two internal keys, not in the prefs UI: `preview-active` (true while the window
  is open) and `preview-tick` (a heartbeat the open window pulses).
- `prefs.js` sets `preview-active` true on the window `map`, false on
  `close-request`, and pulses `preview-tick` every few seconds while open.
- The shell shows a sample with CRITICAL urgency while `preview-active` is true,
  so it stays on screen with no timer juggling, and removes it when the flag goes
  false. Editing a setting re-shows the sample at the new placement.
- If the heartbeat stops (the window closed without a clean `close-request`, or
  its process died), a single shell-side timeout clears the sample, so a CRITICAL
  preview can never linger.
- The sample stays `isTransient` (never enters notification history) and Do Not
  Disturb still suppresses it.

## Consequences

- The preview is visible the whole time the window is open and tracks edits,
  which is the point of a preview.
- No DBus and no private hide-timeout manipulation: persistence comes from
  CRITICAL urgency, and the only cross-process channel is the GSettings `changed`
  already in use — consistent with the review feedback.
- CRITICAL urgency is used for a non-critical sample; accepted as the trade for a
  persistent preview without timer machinery. The reviewer did not object to this.
- A crash of the prefs process leaves the preview on screen at most one stale
  timeout longer, then it clears on its own.
- Supersedes ADR 0014 (NORMAL self-hiding sample) and ADR 0015 (open-time
  trigger), whose `preview-tick` key is now the heartbeat.
