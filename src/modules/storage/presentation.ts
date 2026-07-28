export function formatStorageLocalDateTime(
  instant: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(instant));
}
