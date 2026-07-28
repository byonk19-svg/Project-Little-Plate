export type RefrigeratedBatchFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialRefrigeratedBatchFormState: RefrigeratedBatchFormState = {
  status: "idle",
  message: ""
};
