import type { ReactNode } from "react";

/** この画面の番号付きのまとまり（1 プランを選ぶ・2 お客様情報・3 お申し込みの条件） */
export function PlanSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-5 rounded-3xl border border-neutral-200 bg-white p-[clamp(20px,4vw,32px)]"
    >
      <h2
        id={id}
        className="flex items-center gap-2.5 text-[1.0625rem] font-semibold"
      >
        {/* 番号は見た目の順番。見出し（region の名前）には含めない */}
        <span
          aria-hidden="true"
          className="inline-flex size-[26px] items-center justify-center rounded-full bg-neutral-900 text-[0.8125rem] text-white"
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
