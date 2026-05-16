"use client";

import dynamic from "next/dynamic";
import config from "../../../../sanity.config";

// Cloudflare Workers 環境での SSR を回避するため動的インポートを使用
const NextStudio = dynamic(
  () => import("next-sanity/studio").then((mod) => mod.NextStudio),
  { ssr: false }
);

export default function StudioPage() {
  return <NextStudio config={config} />;
}
