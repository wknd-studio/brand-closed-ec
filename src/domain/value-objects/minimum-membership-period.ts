// 入会日から退会できるようになるまでの最低利用期間（docs/domain/membership.md）
const MINIMUM_MEMBERSHIP_MONTHS = 6;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 入会から6ヶ月の最低利用期間。期間内は会員が自分で退会できない */
export class MinimumMembershipPeriod {
  private constructor(readonly withdrawableFrom: Date) {}

  // 入会日の6ヶ月後の同じ日の0時から退会できる。6ヶ月後の月にその日が無ければ月末にする。
  // 日付は実行環境のタイムゾーン（WorkersはUTC）ではなくJSTで決める。
  // JSTは夏時間が無いため、+9時間ずらしたUTCの日付がJSTの日付になる
  static startingAt(joinedAt: Date): MinimumMembershipPeriod {
    const joined = new Date(joinedAt.getTime() + JST_OFFSET_MS);
    const year = joined.getUTCFullYear();
    const month = joined.getUTCMonth() + MINIMUM_MEMBERSHIP_MONTHS;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(joined.getUTCDate(), lastDay);
    return new MinimumMembershipPeriod(
      new Date(Date.UTC(year, month, day) - JST_OFFSET_MS)
    );
  }

  includes(now: Date): boolean {
    return now < this.withdrawableFrom;
  }
}
