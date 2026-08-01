export type FeedingConfigurationFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialFeedingConfigurationFormState: FeedingConfigurationFormState =
  {
    status: "idle",
    message: ""
  };
