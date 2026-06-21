# 0006 - Declare and verify support for GNOME 45-50

Status: Superseded by [0013](0013-drop-gnome-45-support.md)

## Context

The extension targets the author's current system (GNOME Shell 50) but should
work on the same range as the author's other extensions. Declaring a range is
only meaningful if every used symbol is actually verified against each version,
because GNOME's API is not stable across major versions.

## Decision

Declare `shell-version: ["45", "46", "47", "48", "49", "50"]` and treat it as a
hard constraint. Every symbol the extension uses is verified against each branch
of upstream `gnome-shell` and `mutter` (full local clones at
`/home/vyt/devel/gnome/`, via `git grep`, see CLAUDE.md).

Verified present on all six branches:

- `MessageTray._bannerBin` (banner container) in `js/ui/messageTray.js`;
- the `bannerAlignment` get/set accessor on `MessageTray`;
- the `panel.js` `_updatePanel()` assignments to `Main.messageTray.bannerAlignment`
  (the horizontal reset the extension guards against);
- `Clutter.Actor` `translation-x` / `translation-y` in mutter.

The ESM module format (`Extension` base class) sets the lower bound at GNOME 45.

## Consequences

- The declared range reflects verified compatibility, not an optimistic guess.
- Adding a future version (for example 51) requires running the verification
  procedure in CLAUDE.md, not just appending to the array; in particular the
  `_bannerBin` field, the `bannerAlignment` accessor and the `panel.js` reset
  must be re-confirmed.
- No version-number branching is needed today, since all used symbols behave the
  same across 45-50.
