import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";
import WithdrawalDialog from "./withdrawal-dialog";
import AddressList from "./address-list";
import PaymentMethodButton from "./payment-method-button";
import { openBillingPortalAction } from "./actions";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { CONTACT, MEMBERSHIP_TERMS } from "@/app/legal/legal-notice";
import { formatJstDate } from "./format-jst-date";
import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/cn";

// 電話番号の表記（「00-0000-0000（受付時間 …）」）のうち、受付時間の前の番号だけを tel: のリンクにする
const CONTACT_TEL = CONTACT.phone.text.split("（")[0].replace(/\D/g, "");

// Button の secondary と同じ大きさのピル。cn は同じ種類のクラスを上書きしないため、buttonVariants の色を変えずに書く
const contactLinkClass =
  "inline-flex h-10 items-center justify-center rounded-full border border-info/25 bg-white px-4 text-[13px] font-semibold text-info transition-colors hover:border-info focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none";

function formatMonthlyLimit(amount: number | null): string {
  return amount === null ? "上限なし" : `¥${amount.toLocaleString("ja-JP")}`;
}

export default async function SettingsPage() {
  const { userId } = await requireAuth();
  const queryService = await memberQueryService();
  const [settings, stripeCustomerId] = await Promise.all([
    queryService.findSettings(userId!),
    queryService.findStripeCustomerId(userId!),
  ]);
  const addresses = settings?.addresses ?? [];
  const withdrawableFrom = settings?.withdrawableFrom ?? null;
  const plan = settings?.plan;

  const navItems = [
    ...(plan ? [{ id: "plan", label: "ご契約" }] : []),
    { id: "address", label: "住所" },
    // Stripe Customer は入会の決済で作るため、入会前の会員には出さない
    ...(stripeCustomerId ? [{ id: "payment", label: "お支払い方法" }] : []),
    { id: "withdrawal", label: "退会" },
  ];

  return (
    <Container className="flex flex-col gap-5 pt-6 pb-14 lg:gap-7 lg:pt-12 lg:pb-20">
      <div className="flex flex-col gap-2.5">
        <Eyebrow withLine>MY PAGE</Eyebrow>
        <Heading as="h1" level="compact">
          設定
        </Heading>
      </div>

      <div className="flex items-start gap-8">
        {/* スマホ幅では各欄を縦に並べるだけにし、ナビは出さない */}
        <nav
          aria-label="設定の項目"
          className="sticky top-6 hidden w-[220px] shrink-0 lg:block"
        >
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="flex min-h-10 items-center rounded-lg px-3 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {plan && (
            <SettingsSection id="plan" title="ご契約">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-neutral-700">プラン</dt>
                  <dd className="font-display text-lg font-semibold">
                    {plan.name}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-neutral-700">月間仕入れ上限</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatMonthlyLimit(plan.monthlyLimit)}
                  </dd>
                </div>
              </dl>
            </SettingsSection>
          )}

          <SettingsSection id="address" title="住所" className="gap-[18px]">
            <AddressList
              addresses={addresses}
              type="shipping"
              label="お届け先住所"
            />
            <AddressList
              addresses={addresses}
              type="billing"
              label="請求先住所"
            />
          </SettingsSection>

          {stripeCustomerId && (
            <SettingsSection id="payment" title="お支払い方法">
              <p className="text-sm leading-[1.8] text-neutral-700">
                月額費用のお支払いに使うクレジットカードを変更できます。Stripe
                の画面に移り、変更後はこの画面に戻ります。
              </p>
              <PaymentMethodButton action={openBillingPortalAction} external />
            </SettingsSection>
          )}

          <SettingsSection
            id="withdrawal"
            title="退会"
            className="border-danger/30"
            titleClassName="text-danger"
          >
            <p className="text-sm leading-[1.8] text-neutral-700">
              退会するとサービスをご利用いただけなくなります。サブスクリプションはその場で解約されます。
            </p>
            <p className="text-[13px] leading-[1.8] text-neutral-700">
              <LegalNoticeText value={MEMBERSHIP_TERMS.cancellation} />
            </p>
            {withdrawableFrom && (
              <Alert
                tone="info"
                role="status"
                title="現在は最低利用期間内です。"
              >
                <p className="leading-[1.7]">
                  {formatJstDate(new Date(withdrawableFrom))}
                  からこの画面で退会できます。それまでに退会をご希望の場合は、運営へご連絡ください。
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <a
                    href={`mailto:${CONTACT.email.text}`}
                    className={contactLinkClass}
                  >
                    メールで問い合わせる
                  </a>
                  <a href={`tel:${CONTACT_TEL}`} className={contactLinkClass}>
                    電話で問い合わせる
                  </a>
                </div>
                <p className="text-xs leading-[1.7]">
                  メール: <LegalNoticeText value={CONTACT.email} />
                  <br />
                  電話: <LegalNoticeText value={CONTACT.phone} />
                </p>
              </Alert>
            )}
            <WithdrawalDialog withdrawableFrom={withdrawableFrom} />
          </SettingsSection>
        </div>
      </div>
    </Container>
  );
}

function SettingsSection({
  id,
  title,
  className,
  titleClassName,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex scroll-mt-6 flex-col gap-3.5 rounded-3xl border border-neutral-200 bg-white p-[clamp(20px,4vw,28px)]",
        className
      )}
    >
      <h2
        id={`${id}-title`}
        className={cn("text-[17px] font-semibold", titleClassName)}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
