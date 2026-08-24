import { useState } from "react";

interface MediaImageProps {
  src?: string;
  alt?: string;
  className: string;
  placeholderClassName?: string;
  fallback: string;
  loading?: "lazy" | "eager";
}

/**
 * Renders an image with a graceful placeholder when the source is missing
 * or fails to load. The placeholder reuses `className` (for sizing) plus an
 * optional `placeholderClassName` (for centering the fallback glyph).
 */
export function MediaImage({
  src,
  alt = "",
  className,
  placeholderClassName,
  fallback,
  loading = "lazy",
}: MediaImageProps) {
  const [errored, setErrored] = useState(false);

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className={`${className}${placeholderClassName ? ` ${placeholderClassName}` : ""}`}
      aria-hidden="true"
    >
      {fallback}
    </div>
  );
}
