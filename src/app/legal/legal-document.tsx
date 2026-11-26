import type { ReactNode } from "react";
import { cardVariants } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { PlaceholderBadge } from "@/app/legal/legal-notice-text";
import { cn } from "@/lib/cn";

/** 規約の1つの条。段落のあとに箇条書きを置く。`placeholder` の条は見出しに「要差し替え」を出す */
export type LegalArticle = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  placeholder?: true;
};

/** 規約・表記の1つの文書のカード（#838） */
export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        cardVariants(),
        "flex flex-col gap-6 rounded-3xl px-[18px] py-[22px] lg:px-12 lg:py-10"
      )}
    >
      <div className="flex flex-col gap-2.5 border-b border-neutral-200 pb-5">
        <Eyebrow withLine>LEGAL</Eyebrow>
        <Heading as="h1" level="compact" className="leading-[1.4]">
          {title}
        </Heading>
      </div>
      {children}
    </article>
  );
}

/** 利用規約・プライバシーポリシーの条の並び */
export function LegalArticles({ articles }: { articles: LegalArticle[] }) {
  return (
    <div className="flex flex-col gap-7">
      {articles.map(
        ({ heading, paragraphs = [], items = [], placeholder }, i) => {
          const headingId = `article-${i + 1}`;
          return (
            <section
              key={heading}
              aria-labelledby={headingId}
              className="flex flex-col gap-2.5"
            >
              <h2
                id={headingId}
                className="flex flex-wrap items-center gap-2 text-base font-semibold"
              >
                {heading}
                {placeholder && <PlaceholderBadge />}
              </h2>
              {paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[15px] leading-loose text-neutral-800"
                >
                  {paragraph}
                </p>
              ))}
              {items.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-[1.4em] text-[15px] leading-[1.9] text-neutral-800">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        }
      )}
    </div>
  );
}
