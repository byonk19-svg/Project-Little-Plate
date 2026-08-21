import {
  addExternalRecipeImage,
  deleteRecipeImage,
  uploadRecipeImage
} from "@/modules/recipe-images/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { RecipeImage } from "@/modules/recipe-images/queries";

import { RecipeDetailImage } from "../recipe-detail-image";

export function RecipeImagePanel({
  recipeId,
  image,
  sourceUrl
}: {
  recipeId: string;
  image: RecipeImage | null;
  sourceUrl: string | null;
}) {
  const imageSrc = image?.signedUrl ?? image?.externalUrl;

  return (
    <section
      className="recipe-image-panel foundation-card"
      aria-labelledby="recipe-image-title"
    >
      <p className="foundation-card__status">Optional cover image</p>
      <h2 id="recipe-image-title">Make it easier to recognize</h2>
      {image ? (
        <>
          {imageSrc ? (
            <RecipeDetailImage alt={image.altText} src={imageSrc} />
          ) : (
            <p role="status">
              This image could not be displayed. You can replace it below.
            </p>
          )}
          <p>
            {image.sourceType === "upload"
              ? "Uploaded privately"
              : "External image link"}
          </p>
          {image.rightsNote ? (
            <p>Rights note: {image.rightsNote}</p>
          ) : (
            <p>Rights note not provided.</p>
          )}
          <form action={deleteRecipeImage.bind(null, recipeId, image.id)}>
            <ConfirmSubmitButton
              className="danger-action"
              confirmation="Remove this cover image? The recipe will stay saved."
            >
              Remove image
            </ConfirmSubmitButton>
          </form>
        </>
      ) : (
        <>
          <form action={uploadRecipeImage} className="recipe-image-form">
            <input name="recipeId" type="hidden" value={recipeId} />
            <input name="sourceUrl" type="hidden" value={sourceUrl ?? ""} />
            <label className="field">
              <span>Upload a JPG, PNG, or WebP</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                name="file"
                required
                type="file"
              />
            </label>
            <label className="field">
              <span>Alternative text</span>
              <input maxLength={240} name="altText" required type="text" />
            </label>
            <label className="field">
              <span>Rights note (optional)</span>
              <input maxLength={1000} name="rightsNote" type="text" />
            </label>
            <button className="secondary-action" type="submit">
              Upload image
            </button>
          </form>
          <form action={addExternalRecipeImage} className="recipe-image-form">
            <input name="recipeId" type="hidden" value={recipeId} />
            <input name="sourceUrl" type="hidden" value={sourceUrl ?? ""} />
            <label className="field">
              <span>Or use an approved image URL</span>
              <input
                name="externalUrl"
                placeholder="https://"
                required
                type="url"
              />
            </label>
            <label className="field">
              <span>Alternative text</span>
              <input maxLength={240} name="altText" required type="text" />
            </label>
            <label className="field">
              <span>Rights note (optional)</span>
              <input maxLength={1000} name="rightsNote" type="text" />
            </label>
            <button className="secondary-action" type="submit">
              Save image URL
            </button>
          </form>
        </>
      )}
    </section>
  );
}
