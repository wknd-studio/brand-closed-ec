import type { Meta, StoryObj } from "@storybook/nextjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heading } from "@/components/ui/heading";

// フォントの指定は globals.css と二重に書かず、見本の要素の計算済みの font-family を表示する
function FontSample({
  token,
  className,
  usage,
}: {
  token: string;
  className: string;
  usage: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [family, setFamily] = useState("");
  useEffect(() => {
    if (ref.current) setFamily(getComputedStyle(ref.current).fontFamily);
  }, []);
  return (
    <li className="flex flex-col gap-1 border-b border-neutral-200 py-4">
      <code className="text-sm font-semibold">
        {token}（.{className}）
      </code>
      <span className="text-xs text-neutral-700">{usage}</span>
      <p ref={ref} className={`text-2xl ${className}`}>
        EQ×Mart 会員制の卸仕入れ 0123456789
      </p>
      <span className="font-mono text-xs break-all text-secondary">
        {family}
      </span>
    </li>
  );
}

function HeadingSample({
  level,
  usage,
  children,
}: {
  level: "display" | "section" | "compact";
  usage: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-neutral-200 py-4">
      <code className="text-sm font-semibold">
        {`<Heading level="${level}">`}
      </code>
      <span className="text-xs text-neutral-700">{usage}</span>
      <Heading level={level}>{children}</Heading>
    </li>
  );
}

function Typography() {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">フォント</h2>
        <ul>
          <FontSample
            token="--font-sans"
            className="font-sans"
            usage="本文・UI 全般（日本語のフォールバック込み）。Geist は src/app/layout.tsx の next/font で読み込むため、Storybook ではブラウザの既定のフォントで表示される"
          />
          <FontSample
            token="--font-display"
            className="font-display"
            usage="見出しだけに使う明朝体（本文には使わない）"
          />
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">
          見出し（Heading）
        </h2>
        <ul>
          <HeadingSample level="display" usage="ヒーローの見出し">
            選ばれた会員のための
            <br />
            卸仕入れのサービス
          </HeadingSample>
          <HeadingSample level="section" usage="セクションの見出し（既定）">
            ご利用の流れ
          </HeadingSample>
          <HeadingSample level="compact" usage="カード・画面の小さい見出し">
            プランを選ぶ
          </HeadingSample>
        </ul>
      </section>
    </div>
  );
}

const meta = {
  title: "Foundations/Typography",
  component: Typography,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
