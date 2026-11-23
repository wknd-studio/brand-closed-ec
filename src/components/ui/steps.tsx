import { cn } from "@/lib/cn";

type StepsProps = {
  steps: readonly string[];
  // 今のステップの位置（0始まり）。これより前は済み、後はこれから
  current: number;
  className?: string;
};

export function Steps({ steps, current, className }: StepsProps) {
  return (
    <nav aria-label="お手続きの進み具合" className={className}>
      <ol
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((label, index) => {
          const isCurrent = index === current;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-col gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full",
                  index <= current ? "bg-primary" : "bg-neutral-200"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  isCurrent && "font-semibold text-neutral-900",
                  index < current && "text-neutral-700",
                  index > current && "text-secondary"
                )}
              >
                {index + 1} {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
