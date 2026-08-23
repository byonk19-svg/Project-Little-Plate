const errorMessages: Record<string, string> = {
  archive: "That kitchen note could not be archived. Refresh and try again.",
  invalid: "Check the kitchen note fields and try again.",
  save: "That kitchen note could not be saved.",
  setup: "Finish account setup before saving kitchen notes."
};

export function preparedNoteErrorMessage(
  code: string | undefined
): string | null {
  if (!code) return null;
  return errorMessages[code] ?? "That kitchen note could not be saved.";
}
