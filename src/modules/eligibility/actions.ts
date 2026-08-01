"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FeedingConfigurationFormState } from "@/modules/eligibility/form-state";

type ConfigurationRecord = {
  [key: string]: string;
};

function selectedRecords(
  formData: FormData,
  prefix: "skill" | "restriction" | "exposure",
  valueKey: "status" | "state"
): ConfigurationRecord[] {
  const records: ConfigurationRecord[] = [];

  for (const [name, value] of formData.entries()) {
    const fieldPrefix = `${prefix}:`;
    if (
      name.startsWith(fieldPrefix) &&
      typeof value === "string" &&
      value !== ""
    ) {
      records.push({
        [`${prefix === "skill" ? "skill" : "food"}_id`]: name.slice(
          fieldPrefix.length
        ),
        [valueKey]: value
      });
    }
  }

  return records;
}

export async function saveFeedingConfiguration(
  _previousState: FeedingConfigurationFormState,
  formData: FormData
): Promise<FeedingConfigurationFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const prepDayValue = String(formData.get("prepDay") ?? "");
  const { error } = await supabase.rpc("save_feeding_configuration", {
    p_skill_statuses: selectedRecords(formData, "skill", "status"),
    p_restrictions: selectedRecords(formData, "restriction", "status"),
    p_exposures: selectedRecords(formData, "exposure", "state"),
    p_new_food_pace: String(formData.get("newFoodPace") ?? ""),
    p_preparation_time: String(formData.get("preparationTime") ?? ""),
    p_prep_day: prepDayValue === "" ? null : Number(prepDayValue),
    p_quick_backup_food_ids: formData.getAll("quickBackups").map(String)
  });

  if (error) {
    return {
      status: "error",
      message: error.message.includes("eight quick backups")
        ? "Choose no more than eight quick backups."
        : "Feeding setup could not be saved. Review each selection and try again."
    };
  }

  revalidatePath("/feeding-setup");
  revalidatePath("/foods", "layout");

  return {
    status: "success",
    message: "Feeding setup saved."
  };
}
