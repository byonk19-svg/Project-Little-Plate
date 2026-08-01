export type WeekEditFormState =
  { status: "idle"; message: "" } | { status: "error"; message: string };

export const initialWeekEditFormState: WeekEditFormState = {
  status: "idle",
  message: ""
};
