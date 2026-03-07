/**
 * Format integer cents as USD currency string.
 * All financial values are stored as integer cents.
 */
export function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Format a large cent value as compact currency (e.g., "$1.2M").
 */
export function formatCurrencyCompact(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
}

/**
 * Calculate age from date of birth string (YYYY-MM-DD).
 */
export function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Format a score (0-100) with appropriate color class for dark theme.
 */
export function scoreColorClass(score: number): string {
  if (score >= 85) return "text-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-500/30";
  if (score >= 70) return "text-green-400 bg-green-500/15 ring-1 ring-green-500/30";
  if (score >= 50) return "text-amber-400 bg-amber-500/15 ring-1 ring-amber-500/30";
  return "text-red-400 bg-red-500/15 ring-1 ring-red-500/30";
}

/**
 * Format screening status for display.
 */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Format number with commas.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
