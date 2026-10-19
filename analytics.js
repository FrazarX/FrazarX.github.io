/**
 * Solo Gainz — website visit logging.
 *
 * The site is a static bundle with no server, so the visitor log lives in the
 * same Supabase project as the game and is written by this file. One row per
 * page view.
 *
 * What is sent: a random id the browser invents and keeps in localStorage, a
 * per-tab session id, the page, the referring site's host, the browser and
 * OS the browser reports, the screen size, the interface language and the
 * time. The database decides whether the visit is a first visit or a return -
 * a browser that lies about being new is the board's problem, not ours.
 *
 * What is not sent: an IP address (we never ask for it and never see one),
 * a name, an email, a fingerprint, or anything derived from the machine. The
 * visitor id is random, so it identifies a browser, not a person.
 *
 * The write is fire-and-forget: a failed or blocked request must not hold up
 * the page, and a visitor who blocks it is simply not counted.
 */
(function () {
  "use strict";

  const SUPABASE_URL = "https://oschpozvdrdpjlsgadgl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_QwU5OjJzlQY2RwnJ5q9XXw_olcDysTU";

  const VISITOR_KEY = "sg-visitor";
  const SESSION_KEY = "sg-session";

  function randomId() {
    try {
      if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID().replace(/-/g, "");
      }
    } catch (e) {
      /* fall through to the arithmetic version */
    }
    return (
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  /** The browser's own id for this device. Random, and never derived. */
  function visitorId() {
    try {
      let id = window.localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = randomId();
        window.localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (e) {
      // Storage blocked (private mode, or a browser that says no). The visit
      // is still worth counting, it just cannot be recognised as a return.
      return "anonymous";
    }
  }

  /** One id per browser tab. A reload keeps it; a new tab does not. */
  function sessionId() {
    try {
      let id = window.sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = randomId();
        window.sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      return randomId();
    }
  }

  function firstMatch(ua, re) {
    const m = ua.match(re);
    return m ? m[1] : "";
  }

  /** Browser, version, OS and the kind of device - from the user agent. */
  function describe(ua) {
    let browser = "Other";
    let version = "";

    // Order matters: Edge, Opera and every Chromium browser all claim to be
    // Chrome, so they have to be asked about first.
    if (/Edg\//.test(ua)) {
      browser = "Edge";
      version = firstMatch(ua, /Edg\/([\d.]+)/);
    } else if (/OPR\//.test(ua)) {
      browser = "Opera";
      version = firstMatch(ua, /OPR\/([\d.]+)/);
    } else if (/Firefox\//.test(ua)) {
      browser = "Firefox";
      version = firstMatch(ua, /Firefox\/([\d.]+)/);
    } else if (/Chrome\//.test(ua)) {
      browser = "Chrome";
      version = firstMatch(ua, /Chrome\/([\d.]+)/);
    } else if (/Safari\//.test(ua)) {
      browser = "Safari";
      version = firstMatch(ua, /Version\/([\d.]+)/);
    } else if (/Trident\//.test(ua) || /MSIE /.test(ua)) {
      browser = "Internet Explorer";
      version = firstMatch(ua, /(?:rv:([\d.]+)|MSIE ([\d.]+))/);
    }

    let os = "Other";
    if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Android/.test(ua)) os = "Android";
    else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Linux/.test(ua)) os = "Linux";

    let device = "Desktop";
    if (/bot|crawler|spider|headless/i.test(ua)) device = "Bot";
    else if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) device = "Tablet";
    else if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile/i.test(ua)) device = "Phone";

    return { browser, version, os, device };
  }

  function referrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).host : "";
    } catch (e) {
      return "";
    }
  }

  function logVisit() {
    if (typeof window.fetch !== "function") return;

    const ua = navigator.userAgent || "";
    const d = describe(ua);
    const payload = {
      p_visitor_id: visitorId(),
      p_session_id: sessionId(),
      p_path: window.location.pathname || "/",
      p_referrer_host: referrerHost(),
      p_browser: d.browser,
      p_browser_version: d.version,
      p_os: d.os,
      p_device: d.device,
      p_screen_width: window.screen ? window.screen.width : null,
      p_screen_height: window.screen ? window.screen.height : null,
      p_language: navigator.language || "",
    };

    try {
      window.fetch(`${SUPABASE_URL}/rest/v1/rpc/log_visit`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        // The page may be closing as this goes out; keepalive lets the
        // request finish anyway.
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* A visit log that breaks the site would be worse than no visit log. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", logVisit, { once: true });
  } else {
    logVisit();
  }
})();
