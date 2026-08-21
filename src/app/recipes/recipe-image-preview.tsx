"use client";

import { useEffect, useRef, useState } from "react";

export function RecipeImagePreview({
  src,
  alt,
  fallbackLabel,
  fallbackMessage
}: {
  src: string;
  alt: string;
  fallbackLabel: string;
  fallbackMessage: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (failed) {
    return (
      <p aria-label={fallbackLabel} role="status">
        {fallbackMessage}
      </p>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      alt={alt}
      className="recipe-cover-image"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
