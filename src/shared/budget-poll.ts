/** Display label for curated budget picks: `$ · ~$60` → `$60`. */
export function formatBudgetPollChipLabel(raw: string): string {
  const cleaned = raw.replace(/~/g, "").replace(/·/g, " ");
  const matches = [
    ...cleaned.matchAll(/\$?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/g),
  ];
  if (matches.length > 0) {
    const last = matches[matches.length - 1]![1]!.replace(/,/g, "");
    return `$${last}`;
  }
  return cleaned.replace(/\$\s+/g, "$").replace(/\s+/g, " ").trim() || raw;
}

function clampBudgetAmount(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 999_999;
}

/** Parses typed amounts like `80`, `$80`, `1,250.5` → canonical `$1250.5` / `$1250`. */
export function parseBudgetCustomAmountInput(input: string): string | null {
  const s = input.trim().replace(/,/g, "");
  const m = s.match(/^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const whole = m[1]!;
  const frac = m[2];
  if (frac != null && frac !== "") {
    const num = Number.parseFloat(`${whole}.${frac}`);
    if (!clampBudgetAmount(num)) return null;
    const rounded = Math.round(num * 100) / 100;
    if (Number.isInteger(rounded)) return `$${Math.round(rounded)}`;
    return `$${rounded.toFixed(2)}`;
  }
  const n = Number.parseInt(whole, 10);
  if (!clampBudgetAmount(n)) return null;
  return `$${n}`;
}

export function isValidBudgetCustomVoteToken(s: string): boolean {
  return /^\$\d{1,6}(?:\.\d{1,2})?$/.test(s.trim());
}

export function budgetVoteNumericUsd(token: string): number {
  const m = token.trim().match(/^\$(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return NaN;
  const w = Number.parseFloat(m[1]!);
  const f = m[2] != null ? Number.parseInt(m[2]!.padEnd(2, "0"), 10) / 100 : 0;
  return w + f;
}
