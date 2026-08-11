"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { headingVariants } from "@/components/ui/heading";
import { cn } from "@/lib/cn";

export function SignInPresenter() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 py-16">
      <Container className="flex justify-center">
        <Card className="w-full max-w-[420px] p-[clamp(28px,5vw,40px)] text-center">
          <Eyebrow withLine className="mb-3 justify-center">
            Sign In
          </Eyebrow>
          <SignIn
            waitlistUrl="/waitlist"
            appearance={{
              elements: {
                rootBox: "!w-full !max-w-full",
                cardBox: "!w-full !max-w-full shadow-none",
                card: "!w-full !max-w-full border-none bg-transparent p-0 shadow-none",
                headerTitle: cn(
                  headingVariants({ level: "compact" }),
                  "!text-neutral-900"
                ),
                headerSubtitle: "!text-sm !text-secondary",
                formButtonPrimary: cn(
                  buttonVariants({ variant: "primary" }),
                  "w-full !text-primary-foreground"
                ),
                formFieldInput:
                  "rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                footer: "bg-transparent",
                footerAction: "text-sm text-secondary",
                footerActionLink: "text-primary hover:underline",
                socialButtonsBlockButton:
                  "rounded-md border border-neutral-300 text-sm",
                dividerLine: "bg-neutral-200",
                dividerText: "text-xs text-secondary",
              },
              variables: {
                colorPrimary: "var(--color-primary)",
                borderRadius: "var(--radius-2xl)",
                fontFamily: "var(--font-sans)",
              },
            }}
          />
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-secondary hover:text-primary"
          >
            トップに戻る
          </Link>
        </Card>
      </Container>
    </main>
  );
}
