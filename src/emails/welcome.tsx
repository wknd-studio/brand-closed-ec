import {
  MEMBERSHIP_TERMS,
  legalNoticePlainText,
} from "@/app/legal/legal-notice";
import { PLANS } from "@/app/home-presenter";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import {
  EmailButton,
  EmailHeading,
  MemberEmailLayout,
  Notice,
  SummaryTable,
  formatJstDate,
  yen,
} from "./components";

type Props = {
  rank: MemberRankValue;
  // null は上限なし
  monthlyLimit: number | null;
  initialFee: number;
  monthlyFee: number;
  nextPaymentAt: Date;
  withdrawableFrom: Date;
  shopUrl: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function WelcomeEmail({
  rank,
  monthlyLimit,
  initialFee,
  monthlyFee,
  nextPaymentAt,
  withdrawableFrom,
  shopUrl,
}: Props) {
  // プラン名は料金表・商品画面と同じ出どころ（PLANS）から出す
  const plan = PLANS.find(({ id }) => id === rank)!;
  return (
    <MemberEmailLayout preview="会員登録とお支払いが完了しました。ご契約の内容をお知らせします。">
      <EmailHeading
        eyebrow="WELCOME"
        title="EQ×Mart へようこそ"
        lead={
          "ご入会ありがとうございます。\n会員登録とお支払いが完了しました。ご契約の内容は次のとおりです。"
        }
      />
      <Notice tone="info">
        {legalNoticePlainText(MEMBERSHIP_TERMS.minimumPeriodSummary)}
      </Notice>
      <SummaryTable
        title="ご契約の内容"
        rows={[
          { label: "プラン", value: `${plan.label}（${plan.name}）` },
          {
            label: "月間仕入れ上限",
            value: monthlyLimit === null ? "上限なし" : yen(monthlyLimit),
          },
          {
            label: "今回のお支払い",
            value: `${yen(initialFee + monthlyFee)}（初期費用 ${yen(initialFee)}＋初月の月額 ${yen(monthlyFee)}・税込）`,
          },
          {
            label: "次回のお支払い",
            value: `${formatJstDate(nextPaymentAt)} に月額 ${yen(monthlyFee)}（税込）`,
          },
          {
            // 設定画面と同じく、退会できる日の前日を期間の終わりとして出す
            label: "最低利用期間",
            value: `${formatJstDate(new Date(withdrawableFrom.getTime() - ONE_DAY_MS))} まで`,
          },
        ]}
      />
      <EmailButton href={shopUrl}>ショップを見る</EmailButton>
    </MemberEmailLayout>
  );
}
