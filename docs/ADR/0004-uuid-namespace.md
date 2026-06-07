# 0004 - Use `@VitalyOstanin` as the uuid namespace

Status: Accepted

## Context

A GNOME Shell extension uuid must be globally unique and is conventionally
namespaced with a domain or account after the `@`. Several unrelated public
extensions already use generic names around notification positioning, so a plain
name without a namespace would risk collisions and be ambiguous about ownership.

## Decision

Use `notification-banner@VitalyOstanin` as the uuid, matching the author's other
extensions (`maximize-new-windows@VitalyOstanin`,
`workspace-switcher-popup@VitalyOstanin`, and so on). The directory name and the
GitHub repository name are `notification-banner`.

## Consequences

- Consistent ownership and layout with the author's other extensions.
- No collision with public extensions that share the `notification-banner` stem
  but use a different namespace.
