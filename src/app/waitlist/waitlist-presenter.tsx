"use client";

import Link from "next/link";
import { Waitlist } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";

export function WaitlistPresenter() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 py-16">
      <Container className="flex justify-center">
        <Card className="w-full max-w-[420px] p-[clamp(28px,5vw,40px)] text-center">
          <Eyebrow withLine className="mb-3 justify-center">
            Waitlist
          </Eyebrow>
          <Waitlist appearance={clerkAppearance} />
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
