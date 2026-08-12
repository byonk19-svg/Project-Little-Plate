import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RecipeImage = {
  id: string;
  sourceType: "upload" | "external" | "import_suggestion";
  storagePath: string | null;
  externalUrl: string | null;
  signedUrl: string | null;
  altText: string;
  sourceUrl: string | null;
  rightsNote: string | null;
  mimeType: string | null;
};

export async function getRecipeImage(
  recipeId: string
): Promise<RecipeImage | null> {
  const supabase = await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims || !/^[0-9a-f-]{36}$/i.test(recipeId))
    return null;

  const result = await supabase
    .from("recipe_images")
    .select(
      "id, source_type, storage_path, external_url, alt_text, source_url, rights_note, mime_type"
    )
    .eq("recipe_id", recipeId)
    .maybeSingle();
  if (result.error || !result.data) return null;

  let signedUrl: string | null = null;
  if (result.data.storage_path) {
    const signed = await supabase.storage
      .from("recipe-images")
      .createSignedUrl(result.data.storage_path, 60 * 10);
    signedUrl = signed.data?.signedUrl ?? null;
  }

  return {
    id: result.data.id,
    sourceType: result.data.source_type,
    storagePath: result.data.storage_path,
    externalUrl: result.data.external_url,
    signedUrl,
    altText: result.data.alt_text,
    sourceUrl: result.data.source_url,
    rightsNote: result.data.rights_note,
    mimeType: result.data.mime_type
  };
}
