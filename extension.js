// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {
  Extension,
  InjectionManager,
} from "resource:///org/gnome/shell/extensions/extension.js";

// Setting nick -> Clutter alignment. The banner lives in MessageTray._bannerBin,
// a content-sized child of the work-area-sized MessageTray (BinLayout). Its
// x_align / y_align decide which corner/edge it sits at; GNOME's stock
// `bannerAlignment` setter (used by panel.js) only touches x_align, which proves
// alignment repositions the banner despite x_expand/y_expand being true.
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

// Stock value of the font-scale setting (mirrors the schema <default>): at this
// value no font-size override is applied, the same way 0 / -1 are the no-op
// sentinels for banner-width / corner-radius.
const FONT_SCALE_STOCK = 100;
// Inline paddings for the compact content box, chosen to roughly halve the stock
// vertical padding while keeping the text legible.
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
      // Defensive: the private field name is verified for GNOME 45-50, but if a
      // future version renames it we do nothing rather than throw.
      logError(
        new Error("Main.messageTray._bannerBin not found"),
        "[notification-banner] cannot locate the banner container",
      );
      this._teardown();
      return;
    }

    // Remember the stock container state so disable() restores it exactly.
    this._original = {
      xAlign: this._bannerBin.x_align,
      yAlign: this._bannerBin.y_align,
      translationX: this._bannerBin.translation_x,
      translationY: this._bannerBin.translation_y,
    };

    const proto = messageTray.constructor.prototype;

    // Guard the horizontal position. GNOME's panel.js _updatePanel() resets
    // MessageTray.bannerAlignment (the banner's x_align) to follow the dateMenu
    // on session-mode changes, lock/unlock and panel rebuilds. Redefine the
    // accessor so external writes are ignored and the configured value is kept.
    // The accessor exists on every supported version (45-50). y_align is never
    // touched by GNOME and needs no guard.
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

    // Decorate each banner as it is created. A fresh NotificationMessage is built
    // per notification in _showNotification(), so applying content/appearance
    // settings right after the original ran covers every banner.
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

    this._settingsChangedId = this._settings.connect("changed", () => {
      this._applyPosition();
      // Re-decorate the banner currently on screen so content/appearance
      // changes apply immediately, matching the instant feedback of position
      // changes. _decorateBanner is idempotent: it sets each property from the
      // current settings, so toggling a setting off reverts it on the live
      // banner too.
      this._decorateBanner(this._messageTray);
    });

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

    // Padding via translation, not margin: translation is a paint-time offset
    // that does not interfere with the banner's show/hide `y` animation. The
    // offset points inward from the anchored edge; centered axes get no offset.
    bin.translation_x = h === "left" ? padH : h === "right" ? -padH : 0;
    bin.translation_y = v === "top" ? padV : v === "bottom" ? -padV : 0;
  }

  // Apply content and appearance settings to the current banner. Idempotent:
  // every property is set from the current setting in both directions, so this
  // is run both on a freshly created banner (from the _showNotification
  // override) and on the live banner when settings change. Requires the GNOME
  // 46+ banner structure (MessageHeader, _bodyLabel); on GNOME 45 the structure
  // differs, so this returns early and only positioning applies.
  _decorateBanner(tray) {
    const banner = tray?._banner ?? null;
    const settings = this._settings;
    if (!banner || !settings) return;
    if (!banner._header || !banner._bodyLabel) return; // pre-46 structure

    // Content -----------------------------------------------------------------
    // Each property below is set from the current setting in both directions, so
    // re-running this method (on a settings change) fully reflects the current
    // configuration on the live banner, including toggles turned off.

    // Hide the content title only while it duplicates the application name shown
    // in the header (notification.title === source.title); otherwise show it.
    if (banner.titleLabel) {
      const appName = tray._notification?.source?.title ?? null;
      const duplicate =
        settings.get_boolean("dedupe-title") &&
        appName != null &&
        banner.title === appName;
      banner.titleLabel.visible = !duplicate;
    }

    // Body newlines. The stock `set body` collapses newlines to spaces; re-set
    // the markup from the original body, keeping or collapsing newlines to match
    // the setting. The full text shows when the banner is expanded.
    const rawBody = tray._notification?.body ?? "";
    banner._bodyLabel.setMarkup(
      settings.get_boolean("body-multiline")
        ? rawBody
        : rawBody.replace(/\n/g, " "),
      banner._useBodyMarkup ?? false,
    );

    // Timestamp.
    if (banner._header.timeLabel)
      banner._header.timeLabel.visible = settings.get_boolean("show-timestamp");

    // Expand immediately. Expansion is monotonic: turning the setting off does
    // not re-collapse an already expanded banner (GNOME collapses it on its own
    // timing), so this only ever expands.
    if (settings.get_boolean("force-expand")) tray._expandBanner?.(true);

    // Appearance --------------------------------------------------------------

    // App icon (small, in the header) is not stored under a named field; find it
    // by its style class.
    const appIcon = this._findByStyleClass(banner._header, "message-source-icon");
    if (appIcon) appIcon.visible = settings.get_boolean("show-app-icon");

    // Large notification icon.
    if (banner._icon)
      banner._icon.visible = settings.get_boolean("show-notification-icon");

    // Width / corner radius / font scale on the banner root (which carries both
    // the `message` and `notification-banner` style classes). Rebuild the inline
    // style each time and clear it (null) when nothing overrides the stock look.
    const width = settings.get_int("banner-width");
    const radius = settings.get_int("corner-radius");
    const fontScale = settings.get_int("font-scale");
    const rootStyle = [];
    if (width > 0) rootStyle.push(`width: ${width}px;`);
    if (radius >= 0) rootStyle.push(`border-radius: ${radius}px;`);
    if (fontScale !== FONT_SCALE_STOCK)
      rootStyle.push(`font-size: ${fontScale}%;`);
    banner.set_style(rootStyle.length ? rootStyle.join(" ") : null);

    // Compact: trim the internal paddings of the header and content box; clear
    // the inline style when the setting is off.
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

  // Revert decorations on a banner still on screen when the extension is
  // disabled. The banner is short-lived (MessageTray destroys it in
  // _hideNotificationCompleted) and new banners are no longer decorated once the
  // override is removed, so this only restores the single banner that may be
  // visible at disable() time. Resets to the stock look directly, since the
  // settings are about to be released.
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
    // Restore the stock collapsed body (newlines as spaces), matching GNOME's
    // own `set body`.
    const rawBody = this._messageTray?._notification?.body ?? "";
    banner._bodyLabel.setMarkup(
      rawBody.replace(/\n/g, " "),
      banner._useBodyMarkup ?? false,
    );
  }

  // Depth-first search for the first descendant with the given style class.
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
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = 0;
    }

    // Restore the _showNotification override.
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

    // Restore the banner container to its stock alignment and offsets. The next
    // panel._updatePanel() recomputes x_align as GNOME sees fit.
    if (this._bannerBin && this._original) {
      this._bannerBin.set_x_align(this._original.xAlign);
      this._bannerBin.set_y_align(this._original.yAlign);
      this._bannerBin.translation_x = this._original.translationX;
      this._bannerBin.translation_y = this._original.translationY;
    }

    // Revert decorations on a banner still on screen (short-lived; new banners
    // are no longer decorated now the override is gone).
    this._undecorateBanner(this._messageTray?._banner ?? null);

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
