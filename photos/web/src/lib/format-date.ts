const PL_DATE_TIME: Intl.DateTimeFormatOptions = {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/** Stała strefa — ten sam wynik na serwerze (Docker UTC) i w przeglądarce. */
export function formatPlDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pl-PL", PL_DATE_TIME);
}
