import { RecipeImagePreview } from "./recipe-image-preview";

export function RecipeDetailImage({ src, alt }: { src: string; alt: string }) {
  return (
    <RecipeImagePreview
      alt={alt}
      fallbackLabel="Recipe image unavailable"
      fallbackMessage="This image could not be displayed. You can replace it below."
      src={src}
    />
  );
}
