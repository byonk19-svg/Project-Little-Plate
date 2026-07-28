export type ReactionFormState = {
  status: "idle" | "error";
  message: string | null;
};

export const initialReactionFormState: ReactionFormState = {
  status: "idle",
  message: null
};
