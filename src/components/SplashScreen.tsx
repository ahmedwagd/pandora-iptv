import { useEffect } from "react";

type Props = {
  fading?: boolean;
  message?: string;
};

/**
 * Branded launch splash. Covers the viewport with the SIGNAL design
 * language: green-black canvas, phosphor accent, SMPTE strip and
 * a spinning loader. Parent controls `fading` to animate out.
 */
export function SplashScreen({ fading = false, message = "Tuning signal…" }: Props) {
  // Remove the static HTML splash (#app-splash) once React splash is mounted
  // so the handoff from instant paint → React overlay is seamless.
  useEffect(() => {
    const el = document.getElementById("app-splash");
    if (!el) return;
    // Let React splash paint first, then fade the static node underneath.
    const raf = requestAnimationFrame(() => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      el.style.transition = "opacity 280ms ease";
      window.setTimeout(() => el.remove(), 320);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`splash${fading ? " splash--fading" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading PandoraIPTV"
      aria-busy="true"
    >
      {/* ambient glow – same language as login/home */}
      <div className="splash-glow" aria-hidden />

      <div className="splash-inner">
        <div className="splash-colorbar colorbar colorbar--brand" aria-hidden>
          <span className="colorbar-bar" style={{ background: "#c0c0c0" }} />
          <span className="colorbar-bar" style={{ background: "#c0c000" }} />
          <span className="colorbar-bar" style={{ background: "#00c0c0" }} />
          <span className="colorbar-bar" style={{ background: "#00c000" }} />
          <span className="colorbar-bar" style={{ background: "#c000c0" }} />
          <span className="colorbar-bar" style={{ background: "#c00000" }} />
          <span className="colorbar-bar" style={{ background: "#0000c0" }} />
        </div>

        <p className="splash-eyebrow">Signal · Pandora</p>

        <h1 className="splash-wordmark">
          Pandora<span className="splash-wordmark-accent">IPTV</span>
        </h1>

        <p className="splash-tagline">
          Premium signal. <strong>Zero static.</strong>
        </p>

        <div className="splash-loader" aria-hidden>
          <span className="splash-spinner" />
        </div>

        <p className="splash-status">
          <span className="splash-status-dot" aria-hidden />
          {message}
        </p>
      </div>

      <span className="splash-foot" aria-hidden>
        CH 00 · SIGNAL · 59.94 Hz
      </span>
    </div>
  );
}
