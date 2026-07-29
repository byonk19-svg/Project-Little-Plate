export type FeedbackFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialFeedbackFormState: FeedbackFormState = {
  status: "idle",
  message: ""
};
