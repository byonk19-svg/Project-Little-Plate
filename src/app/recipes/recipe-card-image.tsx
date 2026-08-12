"use client";

import { useState } from "react";

export function RecipeCardImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className="recipe-card__image"
      loading="lazy"
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
