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
})();
