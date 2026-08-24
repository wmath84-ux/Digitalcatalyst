// public/policy-back.js
//
// Back-navigation helper for the standalone legal pages (Terms of Service /
// Privacy Policy). These pages are plain HTML documents, so they are reached
// by a full page navigation from the SPA.
//
// Goals:
//   1. Same-tab navigation from the app keeps the native history entry — the
//      system back button (and the visible "Back" button) return to the exact
//      app page the user came from.
//   2. When the page was opened directly (fresh tab, share link, QR, search),
//      a synthetic history entry is inserted so the system back button
//      redirects INTO the app instead of closing the tab / app. The app's
//      own route history (same sessionStorage key used by the SPA) restores
//      the last visited app page when available.
(function () {
  "use strict";

  var APP_FALLBACK = "/#/home";
  var ROUTE_HISTORY_KEY = "eduvora.routeHistory.v1";

  function lastAppRoute() {
    try {
      var raw = sessionStorage.getItem(ROUTE_HISTORY_KEY);
      var stack = raw ? JSON.parse(raw) : null;
      if (Array.isArray(stack)) {
        for (var i = stack.length - 1; i >= 0; i -= 1) {
          var entry = stack[i];
          if (
            typeof entry === "string" &&
            entry.indexOf("#/") === 0 &&
            entry.indexOf("#/auth") !== 0 &&
            entry.indexOf("#/admin") !== 0
          ) {
            return entry;
          }
        }
      }
    } catch (error) {
      /* storage unavailable — fall back below */
    }
    return null;
  }

  function goIntoApp() {
    // `replace` so the policy page does not stay in the back stack.
    window.location.replace(lastAppRoute() || APP_FALLBACK);
  }

  var referrer = "";
  try {
    referrer = document.referrer || "";
  } catch (error) {
    /* ignore */
  }
  var cameFromApp = referrer.indexOf(window.location.origin) === 0;

  // Same-tab navigation from the app: leave the native back stack alone.
  // Direct / external opens: insert a synthetic entry and turn the system
  // back press into an app redirect.
  if (!cameFromApp || window.history.length <= 1) {
    window.history.replaceState({ eduvoraPolicy: true }, "", window.location.href);
    window.history.pushState({ eduvoraPolicy: true }, "", window.location.href);
    window.addEventListener("popstate", function () {
      goIntoApp();
    });
  }

  // Visible Back buttons (both the hero pill and the footer link).
  function wireBackButtons() {
    var buttons = document.querySelectorAll("[data-policy-back]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener("click", function (event) {
        event.preventDefault();
        if (cameFromApp && window.history.length > 1) {
          window.history.back();
        } else {
          goIntoApp();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireBackButtons);
  } else {
    wireBackButtons();
  }

  // Apply dynamic branding (mirroring index.html behavior)
  function applyDynamicBranding() {
    try {
      var raw = localStorage.getItem("eduvora.branding.v2");
      var legacy = localStorage.getItem("eduvora.brandLogoUrl.v1");
      var data = raw ? JSON.parse(raw) : {};
      var name = (data.appName || "Eduvora").toString().trim().slice(0, 40);
      var tagline = (data.tagline || "Digital Catalyst").toString().trim().slice(0, 80);
      var customLogo = !!data.logoUrl || !!legacy;
      var logo = (data.logoUrl || legacy || "/icons/icon-192x192.svg").toString();
      if (!/^https?:\/\//.test(logo) && !logo.startsWith("/")) logo = "/icons/icon-192x192.svg";

      if (name) {
        var nameEls = document.querySelectorAll(".brand-name");
        for (var j = 0; j < nameEls.length; j++) nameEls[j].textContent = name;
        var prefix = window.location.pathname.indexOf("terms") !== -1 ? "Terms of Service" : "Privacy Policy";
        document.title = prefix + " — " + name + " | " + (tagline || "Digital Catalyst");
      }
      if (tagline) {
        var subEls = document.querySelectorAll(".brand-sub");
        for (var k = 0; k < subEls.length; k++) subEls[k].textContent = tagline;
      }
      
      var badgeEls = document.querySelectorAll(".brand-badge");
      for (var l = 0; l < badgeEls.length; l++) {
        if (customLogo) {
          badgeEls[l].innerHTML = '<img src="' + logo + '" alt="Icon" style="width:100%;height:100%;object-fit:cover;">';
        } else {
          badgeEls[l].innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>';
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  applyDynamicBranding();
})();
