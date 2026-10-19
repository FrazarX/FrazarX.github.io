/**
 * Solo Gainz — frazarx.github.io
 *
 * The site is six panels: title, trailer, FAQ, palette, community, footer.
 * Desktop reads them as a horizontal filmstrip driven by the wheel; touch devices read them as an
 * ordinary vertical page, because hijacking scroll on a phone is how you make
 * a page feel broken.
 *
 * What this file no longer carries, and why:
 *   - an auto-battle arena, a rank-shield shatter, a chest gacha, a live-stats
 *     panel, a download modal and an exercise library. Those sections left the
 *     markup in the redesign; the code stayed behind `if (!el) return;` guards,
 *     doing nothing but parsing.
 *   - the sprite engine and the travelling figure. The figure was removed from
 *     every panel, which took the whole SpritePlayer / frame-loading path with
 *     it, and `media/player/` along with that.
 *   - the Arabic translation layer. The site is English only now: no language
 *     toggle, no `data-ar` markup, no on-demand Cairo request.
 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Desktop: the horizontal filmstrip ─────────────────────────────────────

  class HorizontalHunt {
    constructor(track) {
      this.track = track;
      this.panels = [...track.querySelectorAll(".panel")];
      this.fill = document.getElementById("scrollFill");
      this.dots = document.getElementById("dots");
      this.index = 0;
      this._storeKey = "sg-panel";
      this._buildDots();
      this._restore();
      this._bind();
      this._onScroll();
    }

    _restore() {
      let i = 0;
      try {
        i = parseInt(sessionStorage.getItem(this._storeKey) || "0", 10) || 0;
      } catch (_) {}
      if (i <= 0 || i >= this.panels.length) return;
      // Instant jump (bypassing CSS smooth scroll) so a refresh lands you back
      // on the panel you were reading rather than sliding there.
      const prev = this.track.style.scrollBehavior;
      this.track.style.scrollBehavior = "auto";
      this.track.scrollLeft = i * this.track.clientWidth;
      this.index = i;
      requestAnimationFrame(() => {
        this.track.style.scrollBehavior = prev;
      });
    }

    _buildDots() {
      if (!this.dots) return;
      this.dots.innerHTML = "";
      this.panels.forEach((_, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", `Section ${i + 1}`);
        b.addEventListener("click", () => this.go(i));
        this.dots.appendChild(b);
      });
    }

    _bind() {
      const t = this.track;
      t.addEventListener("scroll", () => this._onScroll(), { passive: true });

      // Wheel and trackpad map to sideways travel, one panel per gesture.
      let wheelLock = false;
      t.addEventListener(
        "wheel",
        (e) => {
          const delta =
            Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          if (Math.abs(delta) < 4) return;
          e.preventDefault();
          if (wheelLock) return;
          wheelLock = true;
          this.go(this.index + (delta > 0 ? 1 : -1));
          setTimeout(() => {
            wheelLock = false;
          }, 620);
        },
        { passive: false }
      );

      window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          e.preventDefault();
          this.go(this.index + 1);
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          this.go(this.index - 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          this.go(0);
        } else if (e.key === "End") {
          e.preventDefault();
          this.go(this.panels.length - 1);
        }
      });
    }

    go(i) {
      const next = Math.max(0, Math.min(this.panels.length - 1, i));
      if (next === this.index) return;
      this.track.scrollTo({
        left: next * this.track.clientWidth,
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }

    _onScroll() {
      const t = this.track;
      const max = t.scrollWidth - t.clientWidth;
      const p = max > 0 ? t.scrollLeft / max : 0;
      if (this.fill) this.fill.style.width = `${Math.min(100, p * 100)}%`;

      const idx = Math.round(t.scrollLeft / t.clientWidth);
      this.index = Math.max(0, Math.min(this.panels.length - 1, idx));

      try {
        sessionStorage.setItem(this._storeKey, String(this.index));
      } catch (_) {}

      if (this.dots) {
        [...this.dots.children].forEach((d, i) =>
          d.classList.toggle("is-active", i === this.index)
        );
      }
      // Drives the staggered content reveal for the panel in view.
      this.panels.forEach((p, i) => p.classList.toggle("is-active", i === this.index));
    }
  }

  // ── Touch: an ordinary vertical page ──────────────────────────────────────

  /** Mirrors page scroll in the header's progress rail. */
  function setupVerticalRail() {
    const fill = document.getElementById("scrollFill");
    if (!fill) return;
    let queued = false;
    const upd = () => {
      queued = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? (window.scrollY || doc.scrollTop) / max : 0;
      fill.style.width = `${Math.min(100, Math.max(0, p * 100))}%`;
    };
    // Coalesced into a frame: a raw scroll handler writing a style on every
    // event is the classic way to make a phone drop frames while scrolling.
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(upd);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    upd();
  }

  /**
   * Reveals content as it scrolls in.
   *
   * The filmstrip gets this for free - it marks the panel in view `.is-active`
   * and the CSS takes it from there. The vertical page has no active panel, so
   * without this every `[data-reveal]` element would sit at `opacity: 0`
   * forever and the phone layout would render as a blank page with a footer.
   *
   * Three ways in, because "the content is visible at all" is not something to
   * stake on one browser API firing. IntersectionObserver is the cheap path;
   * a frame-coalesced scroll handler covers the cases where it stays silent
   * (a backgrounded tab restored from bfcache, some embedded webviews, a page
   * that is never composited); and a timer reveals whatever is left after a
   * few seconds no matter what. A missed animation is a blemish - a page that
   * never paints its text is a broken site.
   */
  function setupReveal() {
    const pending = new Set(document.querySelectorAll("[data-reveal]"));
    if (!pending.size) return;

    const show = (el) => {
      el.classList.add("is-in");
      pending.delete(el);
      if (io) io.unobserve(el);
    };

    const sweep = () => {
      if (!pending.size) return;
      const limit = window.innerHeight * 0.92;
      [...pending].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < limit && r.bottom > 0) show(el);
      });
      if (!pending.size) teardown();
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sweep();
      });
    };

    const teardown = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    let io = null;
    if ("IntersectionObserver" in window && !reduceMotion) {
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && show(e.target)),
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
      pending.forEach((el) => io.observe(el));
    }

    if (reduceMotion) {
      [...pending].forEach(show);
      return;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    sweep();
    // Last resort: whatever is still hidden after this simply appears.
    setTimeout(() => {
      [...pending].forEach(show);
      teardown();
    }, 2500);
  }

  // ── FAQ ───────────────────────────────────────────────────────────────────

  function setupFaq() {
    document.querySelectorAll(".faq-q").forEach((q) => {
      q.addEventListener("click", () => {
        const list = q.closest(".faq-list");
        const item = q.closest(".faq-item");
        const wasOpen = q.getAttribute("aria-expanded") === "true";
        if (list) {
          list.querySelectorAll(".faq-q").forEach((o) => {
            o.setAttribute("aria-expanded", "false");
            const other = o.closest(".faq-item");
            if (other) other.classList.remove("is-open");
          });
        }
        if (!wasOpen && item) {
          q.setAttribute("aria-expanded", "true");
          item.classList.add("is-open");
        }
      });
    });
  }

  // ── Community: live numbers from the cloud database ───────────────────────

  /**
   * The site's public project URL and its publishable key.
   *
   * Both are safe in client JS on their own: the key is publishable *by
   * design*, every table sits behind RLS, and the only function the site is
   * allowed to call is `public_site_stats()` — aggregate counts, no rows, no
   * ids, no usernames. It is the same key the app and the operator board
   * already carry.
   */
  const SUPABASE_URL = "https://oschpozvdrdpjlsgadgl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_QwU5OjJzlQY2RwnJ5q9XXw_olcDysTU";

  /**
   * The rank ladder, weakest to strongest, with the colour the app draws that
   * rank's shield in (`GameSystem.ranks` / `rankTitle` / `_rankColor` in
   * lib/app_system.dart). The tier counts come from the database; the names
   * and the colours are the app's, so the chart and the game agree.
   */
  const RANK_TIERS = [
    { id: "E", label: "Awakened", color: "#8e9bae" },
    { id: "D", label: "Prototype", color: "#4fc3f7" },
    { id: "C", label: "Elite", color: "#4caf50" },
    { id: "B", label: "Veteran", color: "#00e5c3" },
    { id: "A", label: "Ace", color: "#ab47bc" },
    { id: "S", label: "Shadow", color: "#ffb300" },
    { id: "SG", label: "Sovereign", color: "#ffd54f" },
  ];

  /**
   * The four movement families, in the app's own colours
   * (`QuestCategory` in lib/quest_categories.dart).
   */
  const FAMILIES = [
    { id: "upper_push", label: "Upper Push", color: "#f9a31b" },
    { id: "upper_pull", label: "Upper Pull", color: "#24a2de" },
    { id: "lower_front", label: "Lower Front", color: "#4dcd72" },
    { id: "lower_back", label: "Lower Back", color: "#cd4d73" },
  ];

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Rounds a number for display: 1200 -> "1,200", 3600 -> "3.6k". */
  function formatCount(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return `${Math.round(v / 1000)}k`;
    return v.toLocaleString("en-US");
  }

  /**
   * Draws one donut: a slice per entry, drawn as a dashed circle so the
   * segments can be a stroke rather than a filled path.
   */
  function drawDonut(figure, slices, centreLabel) {
    const svg = figure.querySelector("svg");
    const group = figure.querySelector("[data-slices]");
    const legend = figure.querySelector("[data-legend]");
    const value = figure.querySelector("[data-value]");
    const label = figure.querySelector("[data-centre-label]");
    if (!svg || !group || !legend) return;

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    group.textContent = "";
    legend.textContent = "";

    if (label && centreLabel) label.textContent = centreLabel;
    if (value) value.textContent = total > 0 ? formatCount(total) : "0";

    const r = 42;
    const circumference = 2 * Math.PI * r;
    const gap = slices.length > 1 ? 2.5 : 0;
    let offset = 0;

    slices.forEach((slice) => {
      const length = total > 0 ? (slice.value / total) * circumference : 0;
      const drawn = Math.max(length - gap, 0);
      if (drawn > 0) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", "60");
        c.setAttribute("cy", "60");
        c.setAttribute("r", String(r));
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", slice.color);
        c.setAttribute("stroke-width", "13");
        c.setAttribute("stroke-dasharray", `${drawn} ${circumference - drawn}`);
        c.setAttribute("stroke-dashoffset", String(-offset));
        c.setAttribute("transform", "rotate(-90 60 60)");
        group.appendChild(c);
      }
      offset += length;

      const li = document.createElement("li");
      if (slice.value <= 0) li.className = "is-empty";
      const dot = document.createElement("i");
      dot.style.setProperty("--c", slice.color);
      const name = document.createElement("span");
      name.textContent = `${slice.label}${slice.suffix ? ` · ${slice.suffix}` : ""}`;
      const count = document.createElement("b");
      count.textContent = formatCount(slice.value);
      li.append(dot, name, count);
      legend.appendChild(li);
    });
  }

  /** The last 7 days, oldest first, as bars. */
  function drawWeek(container, days) {
    if (!container) return;
    container.textContent = "";
    const rows = Array.isArray(days) ? days.slice(-7) : [];
    const max = rows.reduce((m, d) => Math.max(m, Number(d.sessions) || 0), 0);

    rows.forEach((d) => {
      const sessions = Number(d.sessions) || 0;
      const col = document.createElement("div");
      col.className = "week__col" + (sessions > 0 ? "" : " is-zero");
      col.title = `${d.day} — ${sessions} session${sessions === 1 ? "" : "s"}`;

      const bar = document.createElement("span");
      const height = max > 0 && sessions > 0 ? Math.max(6, Math.round((sessions / max) * 46)) : 3;
      bar.style.height = `${height}px`;

      const day = document.createElement("small");
      const parsed = new Date(`${d.day}T00:00:00`);
      day.textContent = Number.isNaN(parsed.getTime())
        ? "—"
        : parsed.toLocaleDateString("en-US", { weekday: "short" });

      col.append(bar, day);
      container.appendChild(col);
    });

    return max;
  }

  /**
   * Reads the aggregate stats and fills the panel in.
   *
   * A failed fetch is not a broken panel: the numbers keep their em dash, the
   * stamp says so, and the rest of the site carries on. The site has no server
   * of its own, so the database being unreachable is a normal Tuesday.
   */
  async function setupCommunity() {
    const panel = document.querySelector(".panel--community");
    if (!panel) return;

    const stamp = panel.querySelector("[data-stamp]");
    const tiersFigure = panel.querySelector('[data-chart="tiers"]');
    const familiesFigure = panel.querySelector('[data-chart="families"]');
    const bars = panel.querySelector("[data-week-bars]");
    const weekNote = panel.querySelector("[data-week-note]");

    const setStat = (key, value) => {
      const el = panel.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = value;
    };

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/public_site_stats`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(`stats ${response.status}`);
      const data = await response.json();

      const tierCounts = new Map(
        (data.tiers || []).map((t) => [t.rank, Number(t.players) || 0])
      );
      drawDonut(
        tiersFigure,
        RANK_TIERS.map((t) => ({
          label: t.label,
          suffix: t.id,
          color: t.color,
          value: tierCounts.get(t.id) || 0,
        })),
        "players"
      );

      const familyPoints = new Map(
        (data.families || []).map((f) => [f.id, Number(f.points) || 0])
      );
      drawDonut(
        familiesFigure,
        FAMILIES.map((f) => ({
          label: f.label,
          color: f.color,
          value: familyPoints.get(f.id) || 0,
        })),
        "points"
      );

      setStat("players", formatCount(data.players));
      setStat("online_now", formatCount(data.online_now));
      setStat("active_7d", formatCount(data.active_7d));
      setStat("sessions_7d", formatCount(data.sessions_7d));
      setStat("volume_7d", formatCount(data.volume_7d));
      setStat("joined_7d", formatCount(data.joined_7d));

      const max = drawWeek(bars, data.days) || 0;
      if (weekNote) {
        weekNote.textContent =
          max > 0 ? "Sessions per day" : "No sessions logged this week";
      }

      if (stamp) {
        const when = data.generated_at
          ? new Date(data.generated_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "";
        stamp.textContent = when ? `Live from the database · ${when}` : "Live from the database";
      }
    } catch (err) {
      if (stamp) stamp.textContent = "Live numbers are unavailable right now";
      if (weekNote) weekNote.textContent = "—";
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function boot() {
    setupFaq();
    setupReveal();
    setupCommunity();

    const track = document.getElementById("track");
    if (!track) return;

    const modeQuery = window.matchMedia("(max-width: 900px), (pointer: coarse)");

    // If the layout mode flips (a desktop window dragged past the breakpoint)
    // re-initialise cleanly, so neither rig is ever left half-wired.
    const onModeFlip = () => location.reload();
    if (modeQuery.addEventListener) {
      modeQuery.addEventListener("change", onModeFlip);
    } else if (modeQuery.addListener) {
      modeQuery.addListener(onModeFlip);
    }

    // Keeping your place on refresh only applies to the horizontal rig; on a
    // phone the browser's own restore is the expected behaviour.
    if ("scrollRestoration" in history) {
      history.scrollRestoration = modeQuery.matches ? "auto" : "manual";
    }

    if (modeQuery.matches) {
      setupVerticalRail();
    } else {
      new HorizontalHunt(track);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
