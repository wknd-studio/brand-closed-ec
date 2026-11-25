import type { Meta, StoryObj } from "@storybook/nextjs";
import { useEffect, useRef, useState } from "react";

// 値は globals.css と二重に書かず、見本の要素に付いたクラスの計算済みの色を表示する。
// クラス名は Tailwind が拾えるよう、文字列のまま書く
type ColorToken = {
  name: string;
  swatch: string;
  usage: string;
};

const SEMANTIC: ColorToken[] = [
  {
    name: "primary",
    swatch: "bg-primary",
    usage:
      "ブランドのゴールド。ボタンの背景・罫線・アクセント（白地の小さい文字には使わない）",
  },
  {
    name: "primary-light",
    swatch: "bg-primary-light",
    usage: "ゴールドのグラデーションの明るい側",
  },
  {
    name: "primary-strong",
    swatch: "bg-primary-strong",
    usage: "白地の小さい文字（「必須」の印・会員ランク名等）",
  },
  {
    name: "primary-foreground",
    swatch: "bg-primary-foreground",
    usage: "ゴールドの背景に載せる文字",
  },
  { name: "secondary", swatch: "bg-secondary", usage: "補助テキスト" },
  {
    name: "success",
    swatch: "bg-success",
    usage: "完了・成功（「カートに追加しました」・入金確認済み）",
  },
  {
    name: "warning",
    swatch: "bg-warning",
    usage: "注意（対応中・仕入れ枠の残りが少ない）",
  },
  {
    name: "danger",
    swatch: "bg-danger",
    usage: "エラー・上限超過・取り消せない操作",
  },
  {
    name: "info",
    swatch: "bg-info",
    usage: "請求書払い（バッジ・請求書の案内）",
  },
];

const NEUTRAL: ColorToken[] = [
  { name: "neutral-50", swatch: "bg-neutral-50", usage: "ページの背景" },
  { name: "neutral-100", swatch: "bg-neutral-100", usage: "薄い面・タグ" },
  { name: "neutral-200", swatch: "bg-neutral-200", usage: "罫線・カードの枠" },
  { name: "neutral-300", swatch: "bg-neutral-300", usage: "入力欄の枠" },
  { name: "neutral-400", swatch: "bg-neutral-400", usage: "非活性の線" },
  { name: "neutral-500", swatch: "bg-neutral-500", usage: "非活性の文字" },
  { name: "neutral-600", swatch: "bg-neutral-600", usage: "補助テキスト" },
  { name: "neutral-700", swatch: "bg-neutral-700", usage: "本文の弱い文字" },
  { name: "neutral-800", swatch: "bg-neutral-800", usage: "本文" },
  { name: "neutral-900", swatch: "bg-neutral-900", usage: "見出し・強い文字" },
];

function toHex(rgb: string): string {
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return rgb;
  return (
    "#" +
    parts
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function Swatch({ token }: { token: ColorToken }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (ref.current) {
      setValue(toHex(getComputedStyle(ref.current).backgroundColor));
    }
  }, []);
  return (
    <li className="flex items-center gap-4 border-b border-neutral-200 py-3">
      <div
        ref={ref}
        className={`size-12 shrink-0 rounded-xl border border-neutral-200 ${token.swatch}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <code className="text-sm font-semibold">--color-{token.name}</code>
        <span className="font-mono text-xs text-secondary">{value}</span>
        <span className="text-xs text-neutral-700">{token.usage}</span>
      </div>
    </li>
  );
}

function ColorList({ title, tokens }: { title: string; tokens: ColorToken[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul>
        {tokens.map((token) => (
          <Swatch key={token.name} token={token} />
        ))}
      </ul>
    </section>
  );
}

function Colors() {
  return (
    <div className="flex max-w-2xl flex-col gap-8 p-6">
      <ColorList title="セマンティックカラー" tokens={SEMANTIC} />
      <ColorList title="ニュートラル（ウォームグレー）" tokens={NEUTRAL} />
    </div>
  );
}

const meta = {
  title: "Foundations/Colors",
  component: Colors,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Colors>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
