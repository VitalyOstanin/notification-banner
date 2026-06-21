# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Contents

- [Unreleased](#unreleased)
- [1.0](#10)

## [Unreleased]

## [1.0]

First release. Not yet published to extensions.gnome.org.

### Added

- Position: anchor the notification banner at any corner or edge of the primary
  monitor work area, with configurable horizontal and vertical padding. The
  horizontal position is enforced against GNOME's panel logic, which otherwise
  resets it.
- Content: hide a title that repeats the application name, keep newlines in the
  body, show the banner expanded immediately, and toggle the header timestamp.
- Appearance: toggle the application icon and the large notification icon,
  override banner width, corner radius and font scale, and switch to compact
  spacing.
- Live position preview: editing a setting while the preferences window is open
  shows a sample banner at the new placement.
- All settings default to GNOME's stock look, so the extension changes nothing
  until configured.
- Supports GNOME Shell 46-50.
