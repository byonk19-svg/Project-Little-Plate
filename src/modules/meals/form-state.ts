export type ManualMealFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialManualMealFormState: ManualMealFormState = {
  status: "idle",
  message: ""
};
