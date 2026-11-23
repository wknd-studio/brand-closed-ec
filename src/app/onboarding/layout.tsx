import type { ReactNode } from "react";
import { OnboardingHeader } from "./onboarding-header";

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <OnboardingHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
