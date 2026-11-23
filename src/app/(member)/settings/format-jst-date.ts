/** 退会できるようになる日などを「2026年11月15日」の形で出す。実行環境（WorkersはUTC）ではなくJSTの日付 */
export function formatJstDate(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
