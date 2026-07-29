export type AccountDeletionFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialAccountDeletionFormState: AccountDeletionFormState = {
  status: "idle",
  message: ""
};
