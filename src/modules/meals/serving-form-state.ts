export type ServingFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialServingFormState: ServingFormState = {
  status: "idle",
  message: ""
};
