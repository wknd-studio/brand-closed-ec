import { NextResponse } from "next/server";

import { sanityClient } from "@/lib/sanity/client";

const GITHUB_REPO = "wknd-studio/brand-closed-ec";

/**
 * Sanity Studioの「今すぐ実行」ボタンから呼び出される、GitHub Actionsの
 * workflow_dispatchを起動するプロキシエンドポイント（contracts/trigger-api.md, FR-021）。
 * Studio利用者はSanity独自の認証で権限管理されておりClerkセッションを持つとは限らないため、
 * このエンドポイント専用のスコープ限定シークレット（X-Product-Import-Token）で認証する。
 * GitHub PATはこのサーバーサイドにのみ保持し、ブラウザには渡さない（research.md #5）。
 */
export async function POST(req: Request) {
  const token = req.headers.get("X-Product-Import-Token");
  if (!token || token !== process.env.PRODUCT_IMPORT_TRIGGER_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { catalogId } = await req.json();
  if (!catalogId) {
    return NextResponse.json(
      { error: "catalogId is required" },
      { status: 400 }
    );
  }

  const catalog = await sanityClient.fetch<{ _id: string } | null>(
    `*[_type == "scrapingCatalog" && _id == $catalogId][0]{ _id }`,
    { catalogId }
  );
  if (!catalog) {
    return NextResponse.json(
      { error: "catalogId does not correspond to a scrapingCatalog" },
      { status: 400 }
    );
  }

  const dispatchResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/product-data-sync.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PRODUCT_IMPORT_GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { catalogId },
      }),
    }
  );

  if (!dispatchResponse.ok) {
    return NextResponse.json(
      { error: "GitHub Actionsの起動に失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ accepted: true }, { status: 202 });
}
