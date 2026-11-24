import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ChoiceCardProps = LabelHTMLAttributes<HTMLLabelElement>;

// ラジオボタンを中に置いて、カード全体で選ばせる。選ばれた・フォーカスがある見た目は
// 中の入力欄の状態（:has）から付けるため、呼び出し側で選択状態を渡さなくてよい。
// 中の要素は group-has-checked: で選ばれたときの見た目を変えられる
export function ChoiceCard({ className, ...props }: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer flex-col rounded-2xl border-[1.5px] border-neutral-200 bg-white transition-colors hover:border-neutral-300",
        "has-checked:border-primary has-checked:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_7%,white),white_55%)] has-checked:shadow-[0_10px_24px_-14px_color-mix(in_srgb,var(--color-primary)_50%,transparent)]",
        // 色はフォーカスの前から付けておく。transition-colors が outline-color も動かし、一瞬黒い枠が出るため
        "outline-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
        "has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
