/**
 * Solo Gainz — frazarx.github.io
 *
 * The site is five panels: title, trailer, FAQ, palette, footer. Desktop reads
 * them as a horizontal filmstrip driven by the wheel; touch devices read them as an
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

  // ── Boot ──────────────────────────────────────────────────────────────────

  function boot() {
    setupFaq();
    setupReveal();

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
