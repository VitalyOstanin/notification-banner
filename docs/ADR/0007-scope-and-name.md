# 0007 - Scope and name without `-position` suffix

Status: Accepted

## Context

The initial request was narrow: move the notification banner to the bottom-right
corner. A name like `notification-banner-position` would describe that exactly.
However, banner content customization (changing how the content inside the banner
is rendered) was identified as a likely follow-up. Naming the extension after the
narrow "position" feature would force a rename once content customization is
added.

## Decision

Name the extension `notification-banner` (uuid
`notification-banner@VitalyOstanin`), without a `-position` suffix, so the name
covers the broader intended scope: banner position and padding now, banner
content customization later. The current release implements only position and
padding; `stylesheet.css` is reserved as a placeholder for the content work.

## Consequences

- No rename is needed when content customization is added; uuid, schema id and
  repository name stay stable (a uuid change would orphan users' settings and
  their enabled-extensions entry).
- The README and CLAUDE.md state the broader scope explicitly so the narrow
  current feature set is not mistaken for the final scope.
- The GSettings schema id (`org.gnome.shell.extensions.notification-banner`) is
  chosen to match, leaving room to add content-related keys later without a new
  schema.
