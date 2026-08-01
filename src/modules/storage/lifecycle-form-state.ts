export type LifecycleFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialLifecycleFormState: LifecycleFormState = {
  status: "idle",
  message: ""
};
