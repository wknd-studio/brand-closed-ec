import {
  PaymentResultIcon,
  PaymentResultLayout,
  PaymentResultText,
  PaymentResultTitle,
  RestartApplicationLink,
} from "@/app/onboarding/payment/payment-result";

export default async function PaymentCancelPage() {
  return (
    <PaymentResultLayout>
      <PaymentResultIcon kind="card" />
      <PaymentResultTitle>お支払いは完了していません</PaymentResultTitle>
      <PaymentResultText>
        決済画面でのお手続きが中断されました。
        <br />
        今回のお手続きで料金は発生していません。
      </PaymentResultText>
      <RestartApplicationLink note="ご利用の種別の選択から、もう一度お手続きいただけます" />
    </PaymentResultLayout>
  );
}
