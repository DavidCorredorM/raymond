import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n/store";

/**
 * The chrome every preview sits in: one bordered stage that fills whatever
 * height the route gives it, a toolbar row above it, and a full-screen
 * toggle.
 *
 * Full screen is not decoration. The complaint that started this work was
 * that a PDF in a 75vh box under a sidebar is not a viewer, and a real
 * report is designed for a page, not for a column — the Fullscreen API is
 * the only way to give it the whole display without the route inventing its
 * own layer. It's requested on the wrapper, not the stage, so the toolbar
 * (and the way back out) goes with it.
 */
export function PreviewFrame({
  /** Left-hand toolbar text — dimensions, row counts, whatever the viewer knows. */
  status,
  /** Buttons and links specific to this viewer. */
  actions,
  /** Checkerboard for images (so transparency reads), plain otherwise. */
  backdrop = "plain",
  /** Stage padding off for anything that should bleed to the edges (iframes, video). */
  flush = false,
  children,
}: {
  status?: ReactNode;
  actions?: ReactNode;
  backdrop?: "plain" | "checker";
  flush?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const wrapRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === wrapRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      // Rejects on iOS Safari (no element fullscreen) and when the gesture
      // isn't trusted. Swallowed rather than surfaced: the preview is still
      // perfectly usable at its normal size, so an error banner would be
      // noise about a nicety.
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const supported = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

  return (
    <section className={"preview" + (isFullscreen ? " preview-fullscreen" : "")} ref={wrapRef}>
      <div className="preview-toolbar">
        <span className="preview-status">{status}</span>
        <span className="preview-actions">
          {actions}
          {supported && (
            <button type="button" className="preview-button" onClick={toggle}>
              {isFullscreen ? t.preview.exitFullScreen : t.preview.fullScreen}
            </button>
          )}
        </span>
      </div>
      <div
        className={"preview-stage" + (flush ? " preview-stage-flush" : "")}
        data-backdrop={backdrop}
      >
        {children}
      </div>
    </section>
  );
}
