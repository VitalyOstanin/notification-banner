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

// Setting nick -> Clutter alignment for MessageTray._bannerBin (x_align/y_align
// decide which corner/edge the banner sits at).
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

// DBus surface so the prefs window (separate process) can signal when it is open.
// Reachable because the extension runs inside gnome-shell (owns org.gnome.Shell).
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

// No font-size override is applied at this value (mirrors the schema default).
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
      // _bannerBin verified for GNOME 45-50; bail out if a future version renames it.
      logError(
        new Error("Main.messageTray._bannerBin not found"),
        "[notification-banner] cannot locate the banner container",
      );
      this._teardown();
      return;
    }

    // Exported only after the container is located, so the early-return above
    // never leaves an object on the bus (export/unexport stay symmetric).
    this._previewActive = false;
    this._sampleSource = null;
    this._ensureSampleId = 0;
    this._notificationSettings = new Gio.Settings({
      schema_id: "org.gnome.desktop.notifications",
    });
    this._dbus = Gio.DBusExportedObject.wrapJSObject(PREVIEW_IFACE, this);
    this._dbus.export(Gio.DBus.session, PREVIEW_OBJECT_PATH);

    // Stock container state so disable() restores it exactly.
    this._original = {
      xAlign: this._bannerBin.x_align,
      yAlign: this._bannerBin.y_align,
      translationX: this._bannerBin.translation_x,
      translationY: this._bannerBin.translation_y,
    };

    const proto = messageTray.constructor.prototype;

    // Workaround: panel.js _updatePanel() resets bannerAlignment (x_align) on
    // session-mode changes / lock-unlock / panel rebuilds. Redefine the accessor
    // (present on 45-50) to ignore external writes. y_align is never touched.
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

    // Decorate each banner as it is created: a fresh one is built per notification
    // in _showNotification(), so run our hook right after the original.
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

    // After _hideNotificationCompleted destroys this._banner (verified 45-50),
    // we may need a fresh sample.
    this._injectionManager.overrideMethod(
      proto,
      "_hideNotificationCompleted",
      (original) =>
        function (...args) {
          original.apply(this, args);
          self._onBannerHidden();
        },
    );

    this._settings.connectObject(
      "changed",
      () => {
        this._applyPosition();
        // Re-decorate the live banner so changes apply immediately;
        // _decorateBanner is idempotent and reverts toggles turned off too.
        this._decorateBanner(this._messageTray);
      },
      this,
    );

    this._applyPosition();
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

    // Padding via translation, not margin: a paint-time offset that does not
    // disturb the show/hide `y` animation. Points inward from the anchored edge.
    bin.translation_x = h === "left" ? padH : h === "right" ? -padH : 0;
    bin.translation_y = v === "top" ? padV : v === "bottom" ? -padV : 0;
  }

  // DBus: prefs opened. Keep a sample banner on screen whenever no real one is.
  BeginPreview() {
    this._previewActive = true;
    this._ensureSample();
  }

  // DBus: prefs closed.
  EndPreview() {
    this._previewActive = false;
    this._destroySample();
  }

  // Transient CRITICAL sample banner: CRITICAL prevents auto-hide, isTransient
  // keeps it out of history. Flows through the overridden _showNotification.
  _createSample() {
    if (this._sampleSource) return; // at most one live source, no leak
    const tray = Main.messageTray;
    if (!tray) return;
    const modern = typeof MessageTray.getSystemSource === "function";
    let source;
    let notification;
    try {
      if (modern) {
        source = new MessageTray.Source({
          title: SAMPLE_TITLE,
          iconName: SAMPLE_ICON,
        });
        tray.add(source);
        notification = new MessageTray.Notification({
          source,
          title: SAMPLE_TITLE,
          body: SAMPLE_BODY,
          isTransient: true,
          urgency: MessageTray.Urgency.CRITICAL,
        });
        source.addNotification(notification);
      } else {
        // GNOME 45: positional constructors and setter methods.
        source = new MessageTray.Source(SAMPLE_TITLE, SAMPLE_ICON);
        tray.add(source);
        notification = new MessageTray.Notification(
          source,
          SAMPLE_TITLE,
          SAMPLE_BODY,
          {},
        );
        notification.setTransient(true);
        notification.setUrgency(MessageTray.Urgency.CRITICAL);
        source.showNotification(notification);
      }
    } catch (err) {
      logError(
        err,
        "[notification-banner] failed to create position-preview sample",
      );
      return;
    }
    this._sampleSource = source;
    // Drop our reference when the source goes away, so we never touch a destroyed object.
    source.connectObject(
      "destroy",
      () => {
        this._sampleSource = null;
      },
      this,
    );
  }

  _destroySample() {
    if (this._sampleSource) {
      const source = this._sampleSource;
      this._sampleSource = null;
      source.destroy();
    }
  }

  // While preview is active and not under DND, ensure a banner is on screen.
  _ensureSample() {
    if (!this._previewActive) return;
    if (this._dndActive()) return;
    const tray = Main.messageTray;
    if (!tray || tray._banner != null) return;
    this._createSample();
  }

  // Ensure a new sample on the next idle tick — deferred to avoid re-entering
  // the tray state machine from inside its own _hideNotificationCompleted.
  _onBannerHidden() {
    if (!this._previewActive) return;
    if (this._dndActive()) return; // under DND no banner is kept on screen
    if (this._ensureSampleId) return; // already queued
    this._ensureSampleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._ensureSampleId = 0;
      this._ensureSample();
      return GLib.SOURCE_REMOVE;
    });
  }

  // Do Not Disturb sets show-banners to false; under DND no banner is kept.
  _dndActive() {
    return this._notificationSettings
      ? !this._notificationSettings.get_boolean("show-banners")
      : false;
  }

  // Apply content/appearance settings to the current banner. Idempotent (each
  // property set in both directions), so it runs on creation and on change.
  // Requires the GNOME 46+ banner structure; returns early on 45.
  _decorateBanner(tray) {
    const banner = tray?._banner ?? null;
    const settings = this._settings;
    if (!banner || !settings) return;
    if (!banner._header || !banner._bodyLabel) return; // pre-46 structure

    // Hide the content title only while it duplicates the application name shown
    // in the header (notification.title === source.title).
    if (banner.titleLabel) {
      const appName = tray._notification?.source?.title ?? null;
      const duplicate =
        settings.get_boolean("dedupe-title") &&
        appName != null &&
        banner.title === appName;
      banner.titleLabel.visible = !duplicate;
    }

    // Stock `set body` collapses newlines to spaces; re-set the markup keeping or
    // collapsing newlines per the setting.
    const rawBody = tray._notification?.body ?? "";
    banner._bodyLabel.setMarkup(
      settings.get_boolean("body-multiline")
        ? rawBody
        : rawBody.replace(/\n/g, " "),
      banner._useBodyMarkup ?? false,
    );

    if (banner._header.timeLabel)
      banner._header.timeLabel.visible = settings.get_boolean("show-timestamp");

    // Monotonic: only ever expands; GNOME collapses on its own timing.
    if (settings.get_boolean("force-expand")) tray._expandBanner?.(true);

    // App icon (small, in the header) has no named field; find it by style class.
    const appIcon = this._findByStyleClass(banner._header, "message-source-icon");
    if (appIcon) appIcon.visible = settings.get_boolean("show-app-icon");

    if (banner._icon)
      banner._icon.visible = settings.get_boolean("show-notification-icon");

    // Width / radius / font scale on the banner root; clear (null) when nothing
    // overrides the stock look.
    const width = settings.get_int("banner-width");
    const radius = settings.get_int("corner-radius");
    const fontScale = settings.get_int("font-scale");
    const rootStyle = [];
    if (width > 0) rootStyle.push(`width: ${width}px;`);
    if (radius >= 0) rootStyle.push(`border-radius: ${radius}px;`);
    if (fontScale !== FONT_SCALE_STOCK)
      rootStyle.push(`font-size: ${fontScale}%;`);
    banner.set_style(rootStyle.length ? rootStyle.join(" ") : null);

    // Compact: trim header/content-box paddings; clear when off.
    const header = this._findByStyleClass(banner, "message-header");
    const box = this._findByStyleClass(banner, "message-box");
    if (settings.get_boolean("compact")) {
      if (header) header.set_style("padding-bottom: 0; min-height: 0;");
      if (box)
        box.set_style(
          `padding: ${COMPACT_BOX_PADDING}; spacing: ${COMPACT_BOX_SPACING};`,
        );
    } else {
      if (header) header.set_style(null);
      if (box) box.set_style(null);
    }
  }

  // Revert decorations on a banner still on screen at disable() time.
  _undecorateBanner(banner) {
    if (!banner || !banner._header || !banner._bodyLabel) return;
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
    // Restore the stock collapsed body (newlines as spaces).
    const rawBody = this._messageTray?._notification?.body ?? "";
    banner._bodyLabel.setMarkup(
      rawBody.replace(/\n/g, " "),
      banner._useBodyMarkup ?? false,
    );
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

    // Restore the original bannerAlignment accessor.
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

    // Restore the banner container to its stock alignment and offsets.
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
