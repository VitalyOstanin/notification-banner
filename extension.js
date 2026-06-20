// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import {
  Extension,
  InjectionManager,
} from "resource:///org/gnome/shell/extensions/extension.js";

// Setting nick -> Clutter alignment for the banner container.
const H_ALIGN = {
  left: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  right: Clutter.ActorAlign.END,
};
const V_ALIGN = {
  top: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  bottom: Clutter.ActorAlign.END,
};

// DBus surface so the prefs window (a separate process) can signal open/close.
const PREVIEW_IFACE = `
<node>
  <interface name="org.gnome.Shell.Extensions.NotificationBanner">
    <method name="BeginPreview"/>
    <method name="EndPreview"/>
  </interface>
</node>`;
const PREVIEW_OBJECT_PATH = "/org/gnome/Shell/Extensions/NotificationBanner";

const SAMPLE_TITLE = "Notification banner";
const SAMPLE_BODY = "Position preview";
const SAMPLE_ICON = "dialog-information-symbolic";

// Value at which no font-size override is applied (mirrors the schema default).
const FONT_SCALE_STOCK = 100;
const COMPACT_BOX_PADDING = "3px 6px";
const COMPACT_BOX_SPACING = "4px";

export default class NotificationBannerExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._injectionManager = new InjectionManager();

    const messageTray = Main.messageTray;
    this._messageTray = messageTray ?? null;
    this._bannerBin = messageTray?._bannerBin ?? null;
    if (!this._bannerBin) {
      logError(
        new Error("Main.messageTray._bannerBin not found"),
        "[notification-banner] cannot locate the banner container",
      );
      this._teardown();
      return;
    }

    this._setupPreview();

    this._original = {
      xAlign: this._bannerBin.x_align,
      yAlign: this._bannerBin.y_align,
      translationX: this._bannerBin.translation_x,
      translationY: this._bannerBin.translation_y,
    };

    const proto = messageTray.constructor.prototype;
    this._installBannerAlignmentOverride(proto);
    this._installMethodOverrides(proto);

    this._settings.connectObject(
      "changed",
      () => {
        this._applyPosition();
        this._decorateBanner(this._messageTray);
      },
      this,
    );

    this._applyPosition();
  }

  // Export only after _bannerBin is located, so export/unexport stay symmetric.
  _setupPreview() {
    this._previewActive = false;
    this._sampleSource = null;
    this._ensureSampleId = 0;
    this._notificationSettings = new Gio.Settings({
      schema_id: "org.gnome.desktop.notifications",
    });
    this._dbus = Gio.DBusExportedObject.wrapJSObject(PREVIEW_IFACE, this);
    this._dbus.export(Gio.DBus.session, PREVIEW_OBJECT_PATH);
  }

  // panel.js _updatePanel() resets x_align on session-mode / lock / panel
  // rebuilds; redefine the accessor (present on 45-50) to ignore external writes.
  _installBannerAlignmentOverride(proto) {
    this._bannerAlignmentProto = proto;
    this._originalBannerAlignmentDesc =
      Object.getOwnPropertyDescriptor(proto, "bannerAlignment") ?? null;

    const settings = this._settings;
    Object.defineProperty(proto, "bannerAlignment", {
      configurable: true,
      get() {
        return this._bannerBin.get_x_align();
      },
      set(_align) {
        this._bannerBin.set_x_align(
          H_ALIGN[settings.get_string("horizontal-position")] ??
            Clutter.ActorAlign.CENTER,
        );
      },
    });
  }

  _installMethodOverrides(proto) {
    const self = this;
    this._injectionManager.overrideMethod(
      proto,
      "_showNotification",
      (original) =>
        function (...args) {
          original.apply(this, args);
          self._decorateBanner(this);
        },
    );

    this._injectionManager.overrideMethod(
      proto,
      "_hideNotificationCompleted",
      (original) =>
        function (...args) {
          original.apply(this, args);
          self._onBannerHidden();
        },
    );
  }

  _applyPosition() {
    const bin = this._bannerBin;
    if (!bin) return;

    const h = this._settings.get_string("horizontal-position");
    const v = this._settings.get_string("vertical-position");
    const padH = this._settings.get_int("padding-horizontal");
    const padV = this._settings.get_int("padding-vertical");

    bin.set_x_align(H_ALIGN[h] ?? Clutter.ActorAlign.CENTER);
    bin.set_y_align(V_ALIGN[v] ?? Clutter.ActorAlign.START);

    // Padding via translation (a paint-time offset), so it never disturbs the
    // show/hide `y` animation. Points inward from the anchored edge.
    bin.translation_x = h === "left" ? padH : h === "right" ? -padH : 0;
    bin.translation_y = v === "top" ? padV : v === "bottom" ? -padV : 0;
  }

  BeginPreview() {
    this._previewActive = true;
    this._ensureSample();
  }

  EndPreview() {
    this._previewActive = false;
    // Cancel a sample queued by _onBannerHidden, symmetric to disable().
    if (this._ensureSampleId) {
      GLib.source_remove(this._ensureSampleId);
      this._ensureSampleId = 0;
    }
    this._destroySample();
  }

  _createSample() {
    if (this._sampleSource) return; // at most one live source, no leak
    const tray = Main.messageTray;
    if (!tray) return;
    let source;
    try {
      source = this._buildSampleSource(tray);
    } catch (err) {
      logError(
        err,
        "[notification-banner] failed to create position-preview sample",
      );
      return;
    }
    this._sampleSource = source;
    source.connectObject(
      "destroy",
      () => {
        this._sampleSource = null;
      },
      this,
    );
  }

  // Transient CRITICAL sample (CRITICAL prevents auto-hide, transient keeps it
  // out of history); handles the GNOME 45 vs 46+ constructor differences.
  _buildSampleSource(tray) {
    const modern = typeof MessageTray.getSystemSource === "function";
    if (modern) {
      const source = new MessageTray.Source({
        title: SAMPLE_TITLE,
        iconName: SAMPLE_ICON,
      });
      tray.add(source);
      const notification = new MessageTray.Notification({
        source,
        title: SAMPLE_TITLE,
        body: SAMPLE_BODY,
        isTransient: true,
        urgency: MessageTray.Urgency.CRITICAL,
      });
      source.addNotification(notification);
      return source;
    }
    const source = new MessageTray.Source(SAMPLE_TITLE, SAMPLE_ICON);
    tray.add(source);
    const notification = new MessageTray.Notification(
      source,
      SAMPLE_TITLE,
      SAMPLE_BODY,
      {},
    );
    notification.setTransient(true);
    notification.setUrgency(MessageTray.Urgency.CRITICAL);
    source.showNotification(notification);
    return source;
  }

  _destroySample() {
    if (this._sampleSource) {
      const source = this._sampleSource;
      this._sampleSource = null;
      source.destroy();
    }
  }

  _ensureSample() {
    if (!this._previewActive) return;
    if (this._dndActive()) return;
    const tray = Main.messageTray;
    if (!tray || tray._banner != null) return;
    this._createSample();
  }

  // Deferred to the next idle tick to avoid re-entering the tray state machine
  // from inside its own _hideNotificationCompleted.
  _onBannerHidden() {
    if (!this._previewActive) return;
    if (this._dndActive()) return;
    if (this._ensureSampleId) return; // already queued
    this._ensureSampleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._ensureSampleId = 0;
      this._ensureSample();
      return GLib.SOURCE_REMOVE;
    });
  }

  _dndActive() {
    return this._notificationSettings
      ? !this._notificationSettings.get_boolean("show-banners")
      : false;
  }

  // Requires the GNOME 46+ banner structure; early-out on 45.
  _decorateBanner(tray) {
    const banner = tray?._banner ?? null;
    const settings = this._settings;
    if (!banner || !settings) return;
    if (!banner._header || !banner._bodyLabel) return; // pre-46 structure

    const notification = tray._notification ?? null;
    // Reset to stock, then apply only enabled options, so toggles turned off
    // revert without a per-property "else" branch.
    this._resetBannerDecorations(banner, notification);

    if (
      banner.titleLabel &&
      settings.get_boolean("dedupe-title") &&
      banner.title === (notification?.source?.title ?? null)
    )
      banner.titleLabel.visible = false;

    if (settings.get_boolean("body-multiline"))
      banner._bodyLabel.setMarkup(
        notification?.body ?? "",
        banner._useBodyMarkup ?? false,
      );

    if (banner._header.timeLabel && !settings.get_boolean("show-timestamp"))
      banner._header.timeLabel.visible = false;

    // Monotonic: only ever expands; GNOME collapses on its own timing.
    if (settings.get_boolean("force-expand")) tray._expandBanner?.(true);

    // App icon has no named field; find it by style class.
    if (!settings.get_boolean("show-app-icon")) {
      const appIcon = this._findByStyleClass(banner._header, "message-source-icon");
      if (appIcon) appIcon.visible = false;
    }

    if (banner._icon && !settings.get_boolean("show-notification-icon"))
      banner._icon.visible = false;

    this._applyBannerStyle(banner, settings);
  }

  _applyBannerStyle(banner, settings) {
    const width = settings.get_int("banner-width");
    const radius = settings.get_int("corner-radius");
    const fontScale = settings.get_int("font-scale");
    const rootStyle = [];
    if (width > 0) rootStyle.push(`width: ${width}px;`);
    if (radius >= 0) rootStyle.push(`border-radius: ${radius}px;`);
    if (fontScale !== FONT_SCALE_STOCK)
      rootStyle.push(`font-size: ${fontScale}%;`);
    if (rootStyle.length) banner.set_style(rootStyle.join(" "));

    if (settings.get_boolean("compact")) {
      const header = this._findByStyleClass(banner, "message-header");
      const box = this._findByStyleClass(banner, "message-box");
      if (header) header.set_style("padding-bottom: 0; min-height: 0;");
      if (box)
        box.set_style(
          `padding: ${COMPACT_BOX_PADDING}; spacing: ${COMPACT_BOX_SPACING};`,
        );
    }
  }

  // Stock look: shown elements, no style overrides, collapsed body. Shared by
  // _decorateBanner (reset before apply) and _undecorateBanner (final revert).
  _resetBannerDecorations(banner, notification) {
    if (banner.titleLabel) banner.titleLabel.visible = true;
    if (banner._header.timeLabel) banner._header.timeLabel.visible = true;
    const appIcon = this._findByStyleClass(banner._header, "message-source-icon");
    if (appIcon) appIcon.visible = true;
    if (banner._icon) banner._icon.visible = true;
    banner.set_style(null);
    const header = this._findByStyleClass(banner, "message-header");
    const box = this._findByStyleClass(banner, "message-box");
    if (header) header.set_style(null);
    if (box) box.set_style(null);
    banner._bodyLabel.setMarkup(
      (notification?.body ?? "").replace(/\n/g, " "),
      banner._useBodyMarkup ?? false,
    );
  }

  // Called only for the current banner, so body comes from the active notification.
  _undecorateBanner(banner) {
    if (!banner || !banner._header || !banner._bodyLabel) return;
    this._resetBannerDecorations(banner, this._messageTray?._notification ?? null);
  }

  _findByStyleClass(actor, styleClass) {
    if (!actor) return null;
    const children = actor.get_children?.() ?? [];
    for (const child of children) {
      if (child.has_style_class_name?.(styleClass)) return child;
      const found = this._findByStyleClass(child, styleClass);
      if (found) return found;
    }
    return null;
  }

  disable() {
    this._settings?.disconnectObject(this);

    if (this._injectionManager) {
      this._injectionManager.clear();
      this._injectionManager = null;
    }

    if (this._bannerAlignmentProto) {
      if (this._originalBannerAlignmentDesc) {
        Object.defineProperty(
          this._bannerAlignmentProto,
          "bannerAlignment",
          this._originalBannerAlignmentDesc,
        );
      } else {
        delete this._bannerAlignmentProto.bannerAlignment;
      }
      this._bannerAlignmentProto = null;
      this._originalBannerAlignmentDesc = null;
    }

    if (this._bannerBin && this._original) {
      this._bannerBin.set_x_align(this._original.xAlign);
      this._bannerBin.set_y_align(this._original.yAlign);
      this._bannerBin.translation_x = this._original.translationX;
      this._bannerBin.translation_y = this._original.translationY;
    }

    this._undecorateBanner(this._messageTray?._banner ?? null);

    this._previewActive = false;
    if (this._ensureSampleId) {
      GLib.source_remove(this._ensureSampleId);
      this._ensureSampleId = 0;
    }
    this._destroySample();
    if (this._dbus) {
      this._dbus.unexport();
      this._dbus = null;
    }
    this._notificationSettings = null;
    this._teardown();
  }

  _teardown() {
    if (this._injectionManager) {
      this._injectionManager.clear();
      this._injectionManager = null;
    }
    this._original = null;
    this._bannerBin = null;
    this._messageTray = null;
    this._settings = null;
  }
}
