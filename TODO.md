# TODO

## Preview on prefs window open

The position preview only appears after the first setting change, not when the
preferences window opens. Root cause: the preview is driven solely by the
shell-side `Gio.Settings` `changed` handler (extension.js), and opening the prefs
window writes nothing to GSettings, so no `changed` fires until the user edits a
setting.

There is no shell-side "prefs window opened" event: the window lives in a
separate process (the `org.gnome.Shell.Extensions` service), and `Gio.Settings`
only exposes `changed` / `change-event` / `writable-changed` /
`writable-change-event`, all of which fire only on a value/writability write. The
window-open event (`map` / `show`) is available only in `prefs.js`, on the
`Adw.PreferencesWindow` passed to `fillPreferencesWindow`.

Possible fix (deferred): in `prefs.js`, on the window `map` signal, bump a
dedicated trigger key so the shell shows a preview via `changed::<key>`. Two
variants differ only in stored dconf state — a monotonic counter, or a
self-resetting trigger the shell zeroes after previewing. Needs a new ADR
refining ADR 0014 (preview via gsettings change) and a schema key not shown in
the UI.

## Adopt ESLint with `eslint-config-gnome`

Set up linting the way gnome-shell itself does, rather than a plain formatter
(Prettier). ESLint catches real problems (unused vars, `==` vs `===`, `var`,
`consistent-return`) that `node --check` does not, and `eslint-config-gnome` is
the canonical GNOME style reviewers expect on extensions.gnome.org.

Plan:

- Add `package.json` (devDependencies) and a flat `eslint.config.js` based on
  `eslint-config-gnome` (`gnome.configs.recommended` + `gnome.configs.jsdoc`),
  mirroring gnome-shell's `tools/eslint.config.js`.
- Add `.editorconfig` matching GNOME: `*.js` indent 4 spaces, LF, trim trailing
  whitespace.
- Run `eslint --fix` and commit the reformat.

Note: the current code uses 2-space indent and double quotes (Prettier-style),
while `eslint-config-gnome` enforces 4-space indent and single quotes. Adopting
it means reformatting the whole project — a large, mechanical diff. Do it as a
single isolated commit so functional changes stay reviewable.

The same applies to the `mute-banners-timer` extension.
