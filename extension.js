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

// Placement keys: a change to any of these only needs a reposition; every other
// key only needs a re-decoration.
const POSITION_KEYS = new Set([
  "horizontal-position",
  "vertical-position",
  "padding-horizontal",
  "padding-vertical",
]);

// Internal keys the prefs window drives (see schema): preview-active is true
// while the window is open; preview-tick is its heartbeat. Neither is a real
// setting, so they only manage the preview.
const PREVIEW_ACTIVE_KEY = "preview-active";
const PREVIEW_TICK_KEY = "preview-tick";

// Clear the persistent preview if no heartbeat arrives within this window (the
// prefs window closed without notice or its process died). Longer than the
// prefs heartbeat interval so an occasional late pulse does not drop it.
const PREVIEW_STALE_MS = 12000;

const SAMPLE_TITLE = "Notification banner";
const SAMPLE_BODY = "Position preview";
const SAMPLE_ICON = "dialog-information-symbolic";
// Coalesce a burst of setting writes (e.g. dragging a spin row) into one sample.
const PREVIEW_DEBOUNCE_MS = 250;

// Value at which no font-size override is applied (mirrors the schema default).
const FONT_SCALE_STOCK = 100;

export default class NotificationBannerExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._injectionManager = new InjectionManager();

    const messageTray = Main.messageTray;
    this._messageTray = messageTray;
    this._bannerBin = messageTray._bannerBin;

    this._setupPreview();

    this._original = {
      xAlign: this._bannerBin.x_align,
      yAlign: this._bannerBin.y_align,
      translationX: this._bannerBin.translation_x,
      translationY: this._bannerBin.translation_y,
    };

    const proto = MessageTray.MessageTray.prototype;
    this._installBannerAlignmentOverride(proto);
    this._installMethodOverrides(proto);
    this._installDateMenuSuppression();

    // A prefs write (separate process) emits this `changed` on the shell-side
    // settings, so the open prefs window is observable here without any extra
    // IPC. preview-active toggles the persistent preview; preview-tick is its
    // heartbeat; any real key repositions or redecorates and re-previews.
    this._settings.connectObject(
      "changed",
      (_settings, key) => {
        if (key === PREVIEW_ACTIVE_KEY) {
          this._setPreviewActive(this._settings.get_boolean(key));
          return;
        }
        if (key === PREVIEW_TICK_KEY) {
          if (this._settings.get_boolean(PREVIEW_ACTIVE_KEY)) {
            if (!this._sampleSource) this._showPreview();
            this._refreshPreviewStale();
          }
          return;
        }
        if (POSITION_KEYS.has(key)) this._applyPosition();
        else this._decorateBanner(this._messageTray);
        this._queuePreview();
      },
      this,
    );

    this._applyPosition();
  }

  _setupPreview() {
    this._sampleSource = null;
    this._previewId = 0;
    this._staleId = 0;
    this._notificationSettings = new Gio.Settings({
      schema_id: "org.gnome.desktop.notifications",
    });
  }

  // panel.js _updatePanel() resets x_align on session-mode / lock / panel
  // rebuilds; redefine the accessor (present on 46-50) to ignore external writes.
  _installBannerAlignmentOverride(proto) {
    this._bannerAlignmentProto = proto;
    this._originalBannerAlignmentDesc =
      Object.getOwnPropertyDescriptor(proto, "bannerAlignment") ?? null;

    const settings = this._settings;
    Object.defineProperty(proto, "bannerAlignment", {
      configurable: true,
      get() {
        // Read only by panel.js, to compare against each indicator's box
        // alignment and suppress banners while a same-aligned menu is open.
        // Returning FILL (matches no panel box: START/CENTER/END) disables that
        // blanket per-side suppression, which would otherwise hide banners for
        // any menu on the banner's side (e.g. an unrelated right-panel menu).
        // Suppression for the notification list is wired explicitly to the
        // dateMenu instead (see _installDateMenuSuppression and ADR 0012).
        return Clutter.ActorAlign.FILL;
      },
      set(_align) {
        this._bannerBin.set_x_align(
          H_ALIGN[settings.get_string("horizontal-position")] ??
            Clutter.ActorAlign.CENTER,
        );
      },
    });
  }

  // With the bannerAlignment getter neutralized, panel.js no longer suppresses
  // banners for any same-side menu. Reinstate suppression for just the
  // notification list: while the clock menu (dateMenu, which shows the same
  // notifications) is open, block banners so the transient banner does not
  // duplicate the open list. Keyed to the menu, not panel geometry, so it holds
  // even when another extension (e.g. dash-to-panel) moves the clock out of the
  // standard panel boxes. The write goes through the bannerBlocked accessor,
  // cooperating with any mute guard layered on it.
  _installDateMenuSuppression() {
    this._dateMenu = Main.panel?.statusArea?.dateMenu ?? null;
    if (!this._dateMenu?.menu) return;
    this._dateMenu.menu.connectObject(
      "open-state-changed",
      (_menu, isOpen) => {
        const tray = Main.messageTray;
        if (tray) tray.bannerBlocked = isOpen;
      },
      this,
    );
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
  }

  _applyPosition() {
    const bin = this._bannerBin;

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

  _queuePreview() {
    if (this._previewId) return;
    this._previewId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      PREVIEW_DEBOUNCE_MS,
      () => {
        this._previewId = 0;
        this._showPreview();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  // While the prefs window is open the sample is CRITICAL, so it stays on screen
  // (GNOME only auto-hides non-CRITICAL banners) instead of flashing once.
  _setPreviewActive(active) {
    if (active) {
      this._showPreview();
      this._refreshPreviewStale();
    } else {
      this._cancelPreviewStale();
      this._destroySample();
    }
  }

  // The open window pulses preview-tick; if pulses stop (window closed without
  // notice, or its process died) clear the persistent sample so it never lingers.
  _refreshPreviewStale() {
    this._cancelPreviewStale();
    this._staleId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      PREVIEW_STALE_MS,
      () => {
        this._staleId = 0;
        this._destroySample();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  _cancelPreviewStale() {
    if (this._staleId) {
      GLib.source_remove(this._staleId);
      this._staleId = 0;
    }
  }

  _showPreview() {
    if (this._dndActive()) return;
    const tray = Main.messageTray;
    this._destroySample(); // replace any still-visible previous sample
    const source = this._buildSampleSource(tray);
    this._sampleSource = source;
    source.connectObject(
      "destroy",
      () => {
        this._sampleSource = null;
      },
      this,
    );
  }

  // Transient sample, kept out of notification history.
  _buildSampleSource(tray) {
    const source = new MessageTray.Source({
      title: SAMPLE_TITLE,
      iconName: SAMPLE_ICON,
    });
    tray.add(source);
    const params = {
      source,
      title: SAMPLE_TITLE,
      body: SAMPLE_BODY,
      isTransient: true,
    };
    // Persistent (window open) sample stays put; otherwise it auto-hides.
    if (this._settings.get_boolean(PREVIEW_ACTIVE_KEY))
      params.urgency = MessageTray.Urgency.CRITICAL;
    const notification = new MessageTray.Notification(params);
    source.addNotification(notification);
    return source;
  }

  _destroySample() {
    if (this._sampleSource) {
      const source = this._sampleSource;
      this._sampleSource = null;
      source.destroy();
    }
  }

  _dndActive() {
    return !this._notificationSettings.get_boolean("show-banners");
  }

  _decorateBanner(tray) {
    const banner = tray._banner;
    const settings = this._settings;
    if (!banner) return;

    const notification = tray._notification ?? null;
    // Reset to stock, then apply only enabled options, so toggles turned off
    // revert without a per-property "else" branch.
    this._resetBannerDecorations(banner, notification);

    if (
      settings.get_boolean("dedupe-title") &&
      banner.title === (notification?.source?.title ?? null)
    )
      banner.titleLabel.visible = false;

    if (settings.get_boolean("body-multiline"))
      banner._bodyLabel.setMarkup(
        notification?.body ?? "",
        banner._useBodyMarkup,
      );

    if (!settings.get_boolean("show-timestamp"))
      banner._header.timeLabel.visible = false;

    // Monotonic: only ever expands; GNOME collapses on its own timing.
    if (settings.get_boolean("force-expand")) tray._expandBanner(true);

    // App icon has no named field; find it by style class.
    if (!settings.get_boolean("show-app-icon")) {
      const appIcon = this._styleChild(banner._header, "message-source-icon");
      if (appIcon) appIcon.visible = false;
    }

    if (!settings.get_boolean("show-notification-icon"))
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
  }

  // Stock look: shown elements, no style overrides, collapsed body. Shared by
  // _decorateBanner (reset before apply) and _undecorateBanner (final revert).
  _resetBannerDecorations(banner, notification) {
    banner.titleLabel.visible = true;
    banner._header.timeLabel.visible = true;
    const appIcon = this._styleChild(banner._header, "message-source-icon");
    if (appIcon) appIcon.visible = true;
    banner._icon.visible = true;
    banner.set_style(null);
    banner._bodyLabel.setMarkup(
      (notification?.body ?? "").replace(/\n/g, " "),
      banner._useBodyMarkup,
    );
  }

  // Called only for the current banner, so body comes from the active notification.
  _undecorateBanner(banner) {
    if (!banner) return;
    this._resetBannerDecorations(banner, this._messageTray._notification);
  }

  // Memoize the style-class lookup on the actor. Banners are per-notification
  // objects destroyed on hide, so the cache lives exactly as long as the actor
  // and needs no invalidation; it spares the recursive walk on every redecorate.
  _styleChild(actor, styleClass) {
    if (!actor) return null;
    const cache = (actor._nbStyleChildren ??= new Map());
    if (cache.has(styleClass)) return cache.get(styleClass);
    const found = this._findByStyleClass(actor, styleClass);
    cache.set(styleClass, found);
    return found;
  }

  _findByStyleClass(actor, styleClass) {
    if (!actor) return null;
    const children = actor.get_children();
    for (const child of children) {
      if (child.has_style_class_name?.(styleClass)) return child;
      const found = this._findByStyleClass(child, styleClass);
      if (found) return found;
    }
    return null;
  }

  disable() {
    this._settings?.disconnectObject(this);

    if (this._dateMenu?.menu) {
      this._dateMenu.menu.disconnectObject(this);
      // If disabled while the list is open we may have left a block set; lift it
      // (the accessor still respects an active mute guard layered on it).
      if (this._dateMenu.menu.isOpen)
        Main.messageTray.bannerBlocked = false;
    }
    this._dateMenu = null;

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

    this._undecorateBanner(this._messageTray._banner);

    if (this._previewId) {
      GLib.source_remove(this._previewId);
      this._previewId = 0;
    }
    this._cancelPreviewStale();
    this._destroySample();
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
