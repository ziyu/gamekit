export function formatNumber(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function upper(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}
