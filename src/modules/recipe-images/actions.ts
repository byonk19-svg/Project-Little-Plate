"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getHouseholdContext } from "@/modules/household/server";
import {
  maxRecipeImageBytes,
  normalizeExternalImageUrl,
  validateImageFile
} from "@/modules/recipe-images/domain";

async function householdContext() {
  const context = await getHouseholdContext();
  if (context.status === "signed_out") redirect("/login");
  return context.status === "authenticated" ? context : null;
}

function validId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function imageExtension(mimeType: string): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
}

export async function addExternalRecipeImage(
  formData: FormData
): Promise<void> {
  const recipeId = String(formData.get("recipeId") ?? "");
  const altText = String(formData.get("altText") ?? "").trim();
  const rightsNote = String(formData.get("rightsNote") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  let externalUrl: string;
  try {
    externalUrl = normalizeExternalImageUrl(
      String(formData.get("externalUrl") ?? "")
    );
  } catch {
    redirect(`/recipes/${recipeId}?imageError=url`);
  }
  if (!validId(recipeId) || !altText)
    redirect(`/recipes/${recipeId}?imageError=alt`);

  const context = await householdContext();
  if (!context) redirect(`/recipes/${recipeId}?imageError=setup`);
  const result = await context.supabase.from("recipe_images").insert({
    household_id: context.householdId,
    recipe_id: recipeId,
    source_type: "external",
    external_url: externalUrl!,
    alt_text: altText,
    source_url: sourceUrl || null,
    rights_note: rightsNote || null
  });
  revalidatePath(`/recipes/${recipeId}`);
  redirect(
    `/recipes/${recipeId}?${result.error ? "imageError=save" : "imageSaved=1"}`
  );
}

export async function uploadRecipeImage(formData: FormData): Promise<void> {
  const recipeId = String(formData.get("recipeId") ?? "");
  const altText = String(formData.get("altText") ?? "").trim();
  const rightsNote = String(formData.get("rightsNote") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const file = formData.get("file");
  if (!validId(recipeId) || !(file instanceof File) || !file.size) {
    redirect(`/recipes/${recipeId}?imageError=file`);
  }
  const validation = validateImageFile(file);
  if (!validation.ok || !altText || file.size > maxRecipeImageBytes) {
    redirect(`/recipes/${recipeId}?imageError=${!altText ? "alt" : "file"}`);
  }

  const context = await householdContext();
  if (!context) redirect(`/recipes/${recipeId}?imageError=setup`);
  const extension = imageExtension(file.type);
  const storagePath = `${context.householdId}/${recipeId}/${crypto.randomUUID()}.${extension}`;
  const upload = await context.supabase.storage
    .from("recipe-images")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false
    });
  if (upload.error) redirect(`/recipes/${recipeId}?imageError=upload`);

  const metadata = await context.supabase.from("recipe_images").insert({
    household_id: context.householdId,
    recipe_id: recipeId,
    source_type: "upload",
    storage_path: storagePath,
    alt_text: altText,
    source_url: sourceUrl || null,
    rights_note: rightsNote || null,
    mime_type: file.type
  });
  if (metadata.error) {
    await context.supabase.storage.from("recipe-images").remove([storagePath]);
  }
  revalidatePath(`/recipes/${recipeId}`);
  redirect(
    `/recipes/${recipeId}?${metadata.error ? "imageError=save" : "imageSaved=1"}`
  );
}

export async function deleteRecipeImage(
  recipeId: string,
  imageId: string
): Promise<void> {
  if (!validId(recipeId) || !validId(imageId)) return;
  const context = await householdContext();
  if (!context) return;
  await context.supabase
    .from("recipe_images")
    .delete()
    .eq("id", imageId)
    .eq("recipe_id", recipeId);
  revalidatePath(`/recipes/${recipeId}`);
  redirect(`/recipes/${recipeId}?imageSaved=deleted`);
}
