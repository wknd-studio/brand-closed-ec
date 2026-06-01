export function checkMonthlyLimit(
  confirmedAmount: number,
  fixedTotal: number,
  monthlyLimit: number
): string | undefined {
  if (monthlyLimit === 0 || monthlyLimit === Number.MAX_SAFE_INTEGER)
    return undefined;
  if (confirmedAmount + fixedTotal > monthlyLimit)
    return `月次仕入れ上限（¥${monthlyLimit.toLocaleString()}）を超えるため注文できません`;
  return undefined;
}
