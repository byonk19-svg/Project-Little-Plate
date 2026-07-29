export type ReconciliationFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialReconciliationFormState: ReconciliationFormState = {
  status: "idle",
  message: ""
};
