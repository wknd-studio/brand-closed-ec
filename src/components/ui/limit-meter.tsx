import type { MonthlyLimitStatus } from "@/domain/services/cart-limit";
import { cn } from "@/lib/cn";

type LimitMeterProps = {
  // 月間仕入れ上限。null なら無制限
  monthlyLimit: number | null;
  // 今月の確定した注文の金額
  confirmedAmount: number;
  // カートの商品の金額（要相談の商品を除く）
  cartAmount: number;
  // 使用・残り・上限間近か（cart-limit の monthlyLimitStatus の戻り値）。部品の中で判定・計算しない
  status: MonthlyLimitStatus;
  // compact: ヘッダー用の小さい形。detail: 内訳まで出す形
  variant?: "compact" | "detail";
  // compact で、使用の金額にカートの商品の分を添える（スマホ幅の帯）
  cartBreakdown?: boolean;
  // detail の上限の横に出すプラン名
  planName?: string;
  className?: string;
};

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function percent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/** 今月の仕入れ枠（上限・使用・残りと、確定した注文・カートの商品の2色のバー） */
export function LimitMeter({
  monthlyLimit,
  confirmedAmount,
  cartAmount,
  status,
  variant = "compact",
  cartBreakdown = false,
  planName,
  className,
}: LimitMeterProps) {
  const { used } = status;
  const isUnlimited = monthlyLimit === null;
  const remaining = status.isUnlimited ? null : status.remaining;
  const isNear = !status.isUnlimited && status.isNearLimit;
  const remainingAmount =
    remaining === null
      ? "上限なし"
      : remaining < 0
        ? `超過 ${yen(-remaining)}`
        : yen(remaining);
  const remainingTone = isNear ? "text-warning" : "text-neutral-900";
  const confirmedColor = isNear ? "bg-warning" : "bg-primary";
  const cartColor = isNear
    ? "bg-[color-mix(in_srgb,var(--color-warning)_45%,white)]"
    : "bg-primary-light";

  const bar = (height: string) =>
    isUnlimited ? null : (
      <Bar
        height={height}
        monthlyLimit={monthlyLimit}
        confirmedAmount={confirmedAmount}
        cartAmount={cartAmount}
        confirmedColor={confirmedColor}
        cartColor={cartColor}
      />
    );

  if (variant === "detail") {
    return (
      <div className={cn("flex flex-col gap-3.5", className)}>
        <span className="text-sm font-semibold">今月の仕入れ枠の内訳</span>
        {bar("h-2.5")}
        <dl className="m-0 flex flex-col gap-2 text-[0.8125rem] tabular-nums">
          <div className="flex justify-between gap-2 border-b border-neutral-100 pb-2">
            <dt className="text-neutral-700">
              {planName ? `上限（${planName}）` : "上限"}
            </dt>
            <dd className="m-0 font-semibold">
              {isUnlimited ? "無制限" : yen(monthlyLimit)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="inline-flex items-center gap-2 text-neutral-700">
              <Swatch color={confirmedColor} />
              確定した注文
            </dt>
            <dd className="m-0">{yen(confirmedAmount)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="inline-flex items-center gap-2 text-neutral-700">
              <Swatch color={cartColor} />
              カートの商品
            </dt>
            <dd className="m-0">{yen(cartAmount)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-neutral-100 pt-2">
            <dt className="inline-flex items-center gap-2 font-semibold">
              <Swatch color="border border-neutral-300 bg-neutral-100" />
              残り
            </dt>
            <dd className={cn("m-0 text-base font-bold", remainingTone)}>
              {remainingAmount}
            </dd>
          </div>
        </dl>
        <p className="m-0 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs leading-[1.7] text-neutral-700">
          カートに入れた商品も、注文の前から枠に含めて計算します。残りを超える量はカートに入れられません。
        </p>
      </div>
    );
  }

  return (
    <span className={cn("flex flex-col gap-[5px]", className)}>
      <span className="flex items-baseline justify-between gap-2 text-[0.6875rem] text-neutral-700">
        <span>今月の仕入れ枠</span>
        {!isUnlimited && (
          <span className="tabular-nums">上限 {yen(monthlyLimit)}</span>
        )}
      </span>
      {bar("h-1.5")}
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn("text-sm font-bold tabular-nums", remainingTone)}>
          {remaining === null || remaining < 0
            ? remainingAmount
            : `残り ${remainingAmount}`}
        </span>
        <span className="text-[0.6875rem] tabular-nums text-neutral-700">
          使用 {yen(used)}
          {cartBreakdown && `（うちカート ${yen(cartAmount)}）`}
        </span>
      </span>
    </span>
  );
}

function Bar({
  height,
  monthlyLimit,
  confirmedAmount,
  cartAmount,
  confirmedColor,
  cartColor,
}: {
  height: string;
  monthlyLimit: number;
  confirmedAmount: number;
  cartAmount: number;
  confirmedColor: string;
  cartColor: string;
}) {
  // 上限を超えていても、バーは100%で止める
  const confirmedRate =
    monthlyLimit > 0 ? Math.min(confirmedAmount / monthlyLimit, 1) : 0;
  const cartRate =
    monthlyLimit > 0
      ? Math.min(cartAmount / monthlyLimit, 1 - confirmedRate)
      : 0;
  return (
    <span
      aria-hidden="true"
      className={cn("flex overflow-hidden rounded-full bg-neutral-100", height)}
    >
      <span
        data-segment="confirmed"
        className={cn("block h-full transition-all", confirmedColor)}
        style={{ width: percent(confirmedRate) }}
      />
      <span
        data-segment="cart"
        className={cn("block h-full transition-all", cartColor)}
        style={{ width: percent(cartRate) }}
      />
    </span>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("box-border size-2.5 rounded-[3px]", color)}
    />
  );
}
