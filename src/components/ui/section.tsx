import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Container } from "./container";

type SectionProps = HTMLAttributes<HTMLElement> & {
  containerClassName?: string;
};

export function Section({
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn("py-[clamp(56px,9vw,96px)]", className)} {...props}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}
