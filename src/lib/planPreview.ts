/** Render parameters for a human review without echoing obvious secret fields. */
export function describePlanParams(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return "параметров нет";
  return Object.entries(params)
    .map(([name, value]) => {
      const safeValue =
        /password|passphrase|secret|token|(?:api|access|private|client)[_-]?key|credential|authorization|bearer/i.test(
          name,
        )
          ? "[скрыто]"
          : value;
      return `${name}: ${safeValue}`;
    })
    .join("; ");
}
