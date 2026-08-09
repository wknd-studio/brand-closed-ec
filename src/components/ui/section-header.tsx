import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./eyebrow";
import { Heading } from "./heading";

type SectionHeaderProps = {
  eyebrow: ReactNode;
  heading: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  heading,
  description,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-[clamp(32px,5vw,48px)] flex flex-col gap-[10px]",
        className
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading level="section">{heading}</Heading>
      {description && (
        <p className="max-w-[60ch] text-[0.95rem] leading-[1.8] text-neutral-600">
          {description}
        </p>
      )}
    </div>
  );
}
