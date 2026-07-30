export type SessionFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialSessionFormState: SessionFormState = {
  status: "idle",
  message: ""
};
