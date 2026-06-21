# TODO

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
