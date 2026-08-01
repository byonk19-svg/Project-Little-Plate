export type DerivedWorkFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialDerivedWorkFormState: DerivedWorkFormState = {
  status: "idle",
  message: ""
};
