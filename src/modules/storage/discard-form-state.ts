export type DiscardFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialDiscardFormState: DiscardFormState = {
  status: "idle",
  message: ""
};
