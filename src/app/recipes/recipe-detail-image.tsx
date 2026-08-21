"use client";

import { useEffect, useRef, useState } from "react";

export function RecipeDetailImage({ src, alt }: { src: string; alt: string }) {
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
      <p aria-label="Recipe image unavailable" role="status">
        This image could not be displayed. You can replace it below.
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
