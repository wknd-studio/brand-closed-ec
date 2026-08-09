import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FeatureGrid } from "@/components/ui/feature-grid";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";

// 会員メリット・料金プラン・ブランド例のコンテンツ定義

const HOW_IT_WORKS_STEPS = [
  {
    badge: "01",
    title: "月額プランに加入",
    description:
      "事業規模に合わせて7段階のプランからご希望のものを選んで登録します。",
  },
  {
    badge: "02",
    title: "定価より安く購入",
    description: "対象商品を、プランに応じた卸価格で購入できます。",
  },
  {
    badge: "03",
    title: "上限額まで何度でも",
    description: "プランの月間仕入れ上限に達するまで、繰り返し注文できます。",
  },
];

const OTHER_BENEFITS = [
  {
    title: "最大50%OFF",
    description: "対象商品を定価から最大50%OFFの卸価格で購入できます。",
  },
  {
    title: "正規取扱店で安心",
    description: "すべて正規ルートで仕入れた商品のみを取り扱っています。",
  },
  {
    title: "メーカー保証付き",
    description: "対象商品にはメーカー保証が付帯します。",
  },
  {
    title: "請求書払いにも対応",
    description: "法人利用を想定した請求書払いでの決済に対応しています。",
  },
];

// 料金・月間仕入れ上限はdocs/archive/service-spec.mdおよびsrc/domain/value-objects/member-rank.ts
// のMONTHLY_LIMITS（暫定値）に基づく表示専用の値。Stripeの実価格（src/lib/stripe.ts）とは独立して
// 管理する。改定時はここも更新すること。
const PLANS = [
  {
    id: "starter",
    label: "STARTER",
    name: "入門",
    description: "副業・お試し層向け",
    monthlyFee: "5,000",
    initialFee: "5,000",
    monthlyLimit: "300,000",
    featured: false,
  },
  {
    id: "basic",
    label: "BASIC",
    name: "基本",
    description: "個人せどり・副業層向け",
    monthlyFee: "10,000",
    initialFee: "10,000",
    monthlyLimit: "1,000,000",
    featured: false,
  },
  {
    id: "standard",
    label: "STANDARD",
    name: "標準",
    description: "本業EC事業者・小規模セレクトショップ向け",
    monthlyFee: "30,000",
    initialFee: "30,000",
    monthlyLimit: "5,000,000",
    featured: true,
  },
  {
    id: "pro",
    label: "PRO",
    name: "上位",
    description: "中規模セレクトショップ・法人向け",
    monthlyFee: "50,000",
    initialFee: "50,000",
    monthlyLimit: "20,000,000",
    featured: false,
  },
  {
    id: "advanced",
    label: "ADVANCED",
    name: "上級",
    description: "中〜大規模法人向け",
    monthlyFee: "110,000",
    initialFee: "110,000",
    monthlyLimit: "50,000,000",
    featured: false,
  },
  {
    id: "premium",
    label: "PREMIUM",
    name: "最上位",
    description: "大規模法人・チェーン店向け",
    monthlyFee: "330,000",
    initialFee: "330,000",
    monthlyLimit: "100,000,000",
    featured: false,
  },
  {
    id: "enterprise",
    label: "ENTERPRISE",
    name: "個別契約",
    description: "SLA対応・専任チームサポート付き",
    monthlyFee: "要相談",
    initialFee: "要相談",
    monthlyLimit: "無制限",
    featured: false,
  },
] as const;

// Sanity連携（実ブランド・商品データの取得）は別PRで対応する。ここではレイアウト確認用のダミー表示のみ。
const BRAND_EXAMPLES = [
  {
    name: "Brand A",
    category: "アパレル",
    swatch: "bg-[linear-gradient(160deg,#e8c766,#a9791d)]",
  },
  {
    name: "Brand B",
    category: "ライフスタイル雑貨",
    swatch: "bg-[linear-gradient(160deg,#d8d0bb,#746c5c)]",
  },
  {
    name: "Brand C",
    category: "コスメ・ビューティー",
    swatch: "bg-[linear-gradient(160deg,#f3dd94,#8a6415)]",
  },
  {
    name: "Brand D",
    category: "フード・ドリンク",
    swatch: "bg-[linear-gradient(160deg,#c9c2ac,#4d473a)]",
  },
];

export function HomePresenter() {
  return (
    <main className="bg-white text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/88 backdrop-blur-sm">
        <Container className="flex items-center justify-between py-[18px]">
          <Image
            src="/logo.png"
            alt="EQ MART"
            width={919}
            height={346}
            className="h-10 w-auto"
            priority
          />
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            ログイン
          </Link>
        </Container>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero-products.png"
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            className="object-cover object-[center_75%] md:object-[center_35%]"
            priority
          />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,white_0%,white_46%,rgba(255,255,255,0.85)_62%,rgba(255,255,255,0.4)_100%)] md:bg-[linear-gradient(90deg,white_0%,white_38%,rgba(255,255,255,0.82)_55%,rgba(255,255,255,0.15)_78%)]" />
        </div>
        <Container className="relative pt-[clamp(64px,12vw,128px)] pb-[clamp(56px,9vw,96px)]">
          <div className="max-w-[560px]">
            <Eyebrow withLine className="mb-5 text-[0.78rem]">
              INVITATION ONLY
            </Eyebrow>
            <Heading level="display" as="h1">
              手に届く、
              <br />
              <span className="text-primary">憧れ</span>。
            </Heading>
            <p className="mt-3 text-[1.05rem] leading-[1.7] font-semibold">
              いいものを、もっと近くに。
            </p>
            <p className="mt-[22px] max-w-[46ch] text-[1.02rem] leading-[1.9] text-neutral-600">
              EQ×Martは会員限定・招待制のプライベートECです。審査を経た会員だけが、
              厳選ブランドの商品をプラン別の優遇価格で仕入れられます。
            </p>
            <div className="mt-9 flex flex-wrap gap-[14px]">
              <Link href="/waitlist" className={buttonVariants()}>
                登録希望を送る
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "secondary" })}
              >
                ログイン
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="h-px bg-neutral-200" />
      </Container>

      <Section>
        <SectionHeader
          eyebrow="HOW IT WORKS"
          heading="月額プランで、卸価格の仕入れが可能に"
          description="月額費用を支払うことで、会員限定ブランドの商品を定価より安い卸価格で購入できます。購入できる金額にはプランごとの月間上限があり、上限に達するまで何度でも仕入れが可能です。"
        />

        <FeatureGrid columns={3} items={HOW_IT_WORKS_STEPS} />

        <div className="mt-6 rounded-3xl border border-neutral-200 bg-neutral-50 p-[clamp(24px,4vw,40px)]">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <div className="text-center">
              <p className="text-[0.76rem] tracking-[0.1em] text-neutral-600">
                定価
              </p>
              <p className="mt-1 text-[1.6rem] font-bold text-neutral-600 line-through decoration-2">
                ¥10,000
              </p>
            </div>
            <span className="text-[1.4rem] text-primary">→</span>
            <div className="text-center">
              <p className="text-[0.76rem] tracking-[0.1em] text-primary">
                会員価格（例）
              </p>
              <p className="mt-1 text-[1.9rem] font-bold tabular-nums text-primary">
                ¥8,000
              </p>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-[420px]">
            <div className="flex items-baseline justify-between text-[0.78rem] text-neutral-600">
              <span>今月の仕入れ実績（例）</span>
              <span className="tabular-nums">¥180,000 / ¥300,000</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full w-[60%] rounded-full bg-gradient-to-r from-primary-light to-primary" />
            </div>
            <p className="mt-2 text-center text-[0.72rem] text-neutral-600">
              上限額に達するまで、何度でも仕入れ可能です
            </p>
          </div>

          <p className="mt-6 text-center text-[0.72rem] text-neutral-600">
            ※ 価格・割引率は商品・プランにより異なります（画像はイメージです）
          </p>
        </div>

        <FeatureGrid
          columns={2}
          dense
          items={OTHER_BENEFITS}
          className="mt-6"
        />
      </Section>

      <Section>
        <SectionHeader
          eyebrow="PRICING"
          heading="料金プラン"
          description="事業規模に合わせて7段階のプランからお選びいただけます（すべて税込）。各プランには月間の仕入れ上限額があり、上限に達するまでは商品を定価より割安な卸価格で購入できます。"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-4 sm:overflow-x-auto sm:pb-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              featured={plan.featured}
              className="flex flex-col gap-[14px] px-[22px] py-6 transition-transform sm:w-[252px] sm:shrink-0 sm:hover:-translate-y-0.5"
            >
              <span className="text-[0.7rem] tracking-[0.12em] text-neutral-600">
                {plan.label}
              </span>
              <span className="font-display text-[1.15rem] font-semibold">
                {plan.name}
              </span>
              <p className="min-h-[3.4em] text-[0.8rem] leading-[1.7] text-neutral-600">
                {plan.description}
              </p>
              <p className="mt-auto text-[1.5rem] font-bold tabular-nums">
                {plan.monthlyFee === "要相談" ? (
                  "要相談"
                ) : (
                  <>
                    <span className="text-[0.9rem] font-medium">¥</span>
                    {plan.monthlyFee}
                    <span className="text-[0.78rem] font-normal text-neutral-600">
                      {" "}
                      / 月
                    </span>
                  </>
                )}
              </p>
              <div className="text-[0.76rem] tabular-nums text-neutral-600">
                初期費用{" "}
                {plan.initialFee === "要相談"
                  ? "要相談"
                  : `¥${plan.initialFee}`}
              </div>
              <div className="rounded-lg bg-neutral-50 px-3 py-2">
                <p className="text-[0.7rem] text-neutral-600">月間仕入れ上限</p>
                <p className="text-[0.95rem] font-semibold tabular-nums">
                  {plan.monthlyLimit === "無制限"
                    ? "無制限"
                    : `¥${plan.monthlyLimit}`}
                </p>
                <p className="mt-1 text-[0.68rem] leading-[1.5] text-neutral-600">
                  上限までは定価より割安な卸価格で購入できます
                </p>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-[18px] hidden items-center gap-2 text-[0.82rem] text-neutral-600 sm:flex">
          <span className="text-primary">→</span>
          横にスクロールしてすべてのプランを確認できます
        </p>
      </Section>

      <Section>
        <SectionHeader eyebrow="BRANDS" heading="取り扱いブランド・商品例" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {BRAND_EXAMPLES.map((brand) => (
            <Card key={brand.name} className="overflow-hidden p-0">
              <div className={`aspect-square ${brand.swatch}`} />
              <div className="px-4 pt-[14px] pb-[18px]">
                <p className="font-display text-[0.98rem] font-semibold">
                  {brand.name}
                </p>
                <p className="mt-[3px] text-[0.78rem] text-neutral-600">
                  {brand.category}
                </p>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-[18px] text-[0.8rem] text-neutral-600">
          ※ 掲載中のブランド・商品はイメージです
        </p>
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] bg-neutral-50 p-[clamp(40px,7vw,64px)]">
          <Heading level="compact" as="h2" className="max-w-[22ch]">
            まずは登録希望から。
            <br />
            審査のうえご案内します。
          </Heading>
          <Link href="/waitlist" className={buttonVariants()}>
            登録希望を送る
          </Link>
        </div>
      </Section>

      <footer className="border-t border-neutral-200 pt-7 pb-10">
        <Container className="flex flex-wrap items-center justify-between gap-3 text-[0.78rem] text-neutral-600">
          <span>&copy; {new Date().getFullYear()} EQ×Mart</span>
          <span>招待制のプライベートEC</span>
        </Container>
      </footer>
    </main>
  );
}
