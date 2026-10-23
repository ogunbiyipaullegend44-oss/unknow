const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function matchesResearchMonths(dateValue, scope) {
  const months = scope?.months?.length
    ? scope.months
    : scope?.month
      ? [scope.month]
      : [];
  if (!months.length) return true;
  const fromYear = Number(scope?.fromYear ?? scope?.year);
  const toYear = Number(scope?.toYear ?? scope?.year);
  const date = new Date(dateValue);
  if (!Number.isFinite(fromYear) || fromYear !== toYear || !Number.isFinite(date.getTime())) {
    return false;
  }
  return date.getUTCFullYear() === fromYear &&
    months.includes(MONTHS[date.getUTCMonth()]);
}
