// 料金はトップページの料金表（PLANS）と同じ、3桁区切りの表示用の値で受け取る
type PlanFees = { initialFee: string; monthlyFee: string };

function toYen(fee: string): number | null {
  return /^\d{1,3}(,\d{3})*$/.test(fee)
    ? Number(fee.replaceAll(",", ""))
    : null;
}

/**
 * 申込みの確定時に支払う金額（初期費用＋初月の月額）を3桁区切りで返す。
 * 金額が「要相談」のプラン（個別契約）は申込みの対象外のため null
 */
export function todayPayment({ initialFee, monthlyFee }: PlanFees) {
  const initial = toYen(initialFee);
  const monthly = toYen(monthlyFee);
  if (initial === null || monthly === null) return null;
  return (initial + monthly).toLocaleString("ja-JP");
}
