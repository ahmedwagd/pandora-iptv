const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];

interface ColorBarProps {
  className?: string;
}

/**
 * The SMPTE color-bar strip — the app's signature mark, drawn from the
 * television world's own "no signal / test pattern" artifact. Used with
 * restraint: the logo, the loading indicator, and empty states.
 */
export function ColorBar({ className }: ColorBarProps) {
  return (
    <span className={`colorbar${className ? ` ${className}` : ""}`} aria-hidden="true">
      {BARS.map((color) => (
        <span key={color} className="colorbar-bar" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}
