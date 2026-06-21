// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

// Order must match the enum nicks in the gschema and the indices used below.
const H_NICKS = ["left", "center", "right"];
const H_LABELS = ["Left", "Center", "Right"];
const V_NICKS = ["top", "center", "bottom"];
const V_LABELS = ["Top", "Center", "Bottom"];

// A page step (PageUp/PageDown) covers this many spin increments.
const PAGE_STEP_FACTOR = 10;

// Spin ranges; lower/upper must stay in sync with <range> in the gschema.
const RANGES = {
  "padding-horizontal": { lower: 0, upper: 400 },
  "padding-vertical": { lower: 0, upper: 400 },
  "banner-width": { lower: 0, upper: 2000, step: 10 },
  "corner-radius": { lower: -1, upper: 200 },
  "font-scale": { lower: 50, upper: 200, step: 5 },
};

export default class NotificationBannerPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();

    this._addPositionGroup(page, settings);
    this._addContentGroup(page, settings);
    this._addAppearanceGroup(page, settings);

    window.add(page);
  }

  _addPositionGroup(page, settings) {
    const group = new Adw.PreferencesGroup({
      title: "Position",
      description:
        "Where the banner is anchored within the primary monitor work area. " +
        "Defaults match GNOME (top-center).",
    });
    page.add(group);

    group.add(
      this._enumRow(settings, "horizontal-position", "Horizontal position", H_NICKS, H_LABELS),
    );
    group.add(
      this._enumRow(settings, "vertical-position", "Vertical position", V_NICKS, V_LABELS),
    );
    group.add(
      this._spinRow(settings, "padding-horizontal", "Horizontal padding (px)", {
        subtitle: "Ignored when horizontal position is center",
      }),
    );
    group.add(
      this._spinRow(settings, "padding-vertical", "Vertical padding (px)", {
        subtitle: "Ignored when vertical position is center",
      }),
    );
  }

  _addContentGroup(page, settings) {
    const group = new Adw.PreferencesGroup({ title: "Content" });
    page.add(group);

    group.add(
      this._switchRow(settings, "dedupe-title", "Hide duplicate title", {
        subtitle: "When the title equals the application name in the header",
      }),
    );
    group.add(
      this._switchRow(settings, "body-multiline", "Keep newlines in body", {
        subtitle: "Shown in full when the banner is expanded",
      }),
    );
    group.add(
      this._switchRow(settings, "show-timestamp", "Show timestamp", {}),
    );
    group.add(
      this._switchRow(settings, "force-expand", "Expand immediately", {
        subtitle: "Show full body and action buttons right away",
      }),
    );
  }

  _addAppearanceGroup(page, settings) {
    const group = new Adw.PreferencesGroup({ title: "Appearance" });
    page.add(group);

    group.add(
      this._switchRow(settings, "show-app-icon", "Show application icon", {}),
    );
    group.add(
      this._switchRow(settings, "show-notification-icon", "Show notification icon", {}),
    );
    group.add(
      this._spinRow(settings, "banner-width", "Banner width (px)", {
        subtitle: "0 keeps the GNOME default (34em)",
      }),
    );
    group.add(
      this._spinRow(settings, "corner-radius", "Corner radius (px)", {
        subtitle: "-1 keeps the GNOME default",
      }),
    );
    group.add(
      this._spinRow(settings, "font-scale", "Font scale (%)", {
        subtitle: "100 keeps the GNOME default",
      }),
    );
  }

  _enumRow(settings, key, title, nicks, labels) {
    const row = new Adw.ComboRow({ title, model: Gtk.StringList.new(labels) });

    const sync = () => {
      const idx = nicks.indexOf(settings.get_string(key));
      if (idx >= 0 && row.selected !== idx) row.selected = idx;
    };
    sync();

    row.connect("notify::selected", () => {
      const nick = nicks[row.selected];
      if (nick && settings.get_string(key) !== nick)
        settings.set_string(key, nick);
    });
    settings.connect(`changed::${key}`, sync);

    return row;
  }

  _switchRow(settings, key, title, { subtitle } = {}) {
    const row = new Adw.SwitchRow({ title, ...(subtitle ? { subtitle } : {}) });
    settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
    return row;
  }

  _spinRow(settings, key, title, { subtitle } = {}) {
    const { lower, upper, step = 1 } = RANGES[key];
    const row = new Adw.SpinRow({
      title,
      ...(subtitle ? { subtitle } : {}),
      adjustment: new Gtk.Adjustment({
        lower,
        upper,
        step_increment: step,
        page_increment: step * PAGE_STEP_FACTOR,
      }),
    });
    settings.bind(key, row, "value", Gio.SettingsBindFlags.DEFAULT);
    return row;
  }
}
