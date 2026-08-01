export type PlannerGenerationFormState =
  { status: "idle"; message: "" } | { status: "error"; message: string };

export const initialPlannerGenerationFormState: PlannerGenerationFormState = {
  status: "idle",
  message: ""
};
