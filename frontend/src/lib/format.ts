import dayjs from "dayjs";

const symbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
};

export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "SGD"];

export function money(amount: number, currency = "USD"): string {
  const sym = symbols[currency] || `${currency} `;
  const val = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}${sym}${val}`;
}

export function fmtDate(d?: string | null, f = "MMM D, YYYY"): string {
  if (!d) return "";
  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format(f) : "";
}

export function dateRange(start?: string, end?: string): string {
  if (!start || !end) return "";
  const s = dayjs(start);
  const e = dayjs(end);
  if (s.year() === e.year()) {
    return `${s.format("MMM D")} – ${e.format("MMM D, YYYY")}`;
  }
  return `${s.format("MMM D, YYYY")} – ${e.format("MMM D, YYYY")}`;
}

export function elapsed(since?: string | null): string {
  if (!since) return "00:00:00";
  const start = dayjs(since);
  const diff = dayjs().diff(start, "second");
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
