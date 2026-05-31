import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PortableText } from "@portabletext/react";
import { createAdminClient } from "@/lib/supabase/server-admin";
import {
  fetchProductById,
  isProductAccessible,
  type MemberRank,
} from "@/lib/sanity/products";
import ImageGallery from "./image-gallery";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("rank")
    .eq("clerk_user_id", userId!)
    .single();

  const userRank = user?.rank ?? "free";
  const product = await fetchProductById(id);

  if (!product || !isProductAccessible(userRank, product.min_rank)) {
    notFound();
  }

  const rankPrice = product.is_negotiable
    ? null
    : (product.prices?.[userRank as MemberRank] ?? null);
  const isOutOfStock = product.availability === "out_of_stock";
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/shop"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        ← 商品一覧に戻る
      </Link>
      <div className="grid gap-10 md:grid-cols-2">
        {/* 画像ギャラリー */}
        <ImageGallery images={(product.images ?? []).filter(Boolean)} />

        {/* 商品情報 */}
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">{product.brand}</p>
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            {product.categories && product.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {product.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 価格 */}
          <div className="space-y-1 rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-400">
              参考小売価格 ¥{product.retail_price.toLocaleString()}
            </p>
            {product.is_negotiable ? (
              <p className="text-xl font-semibold text-gray-700">価格要相談</p>
            ) : rankPrice != null ? (
              <p className="text-2xl font-bold">
                ¥{rankPrice.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-gray-500">
                  （{userRank} ランク価格）
                </span>
              </p>
            ) : null}
          </div>

          {/* 在庫状況 */}
          <div>
            {isOutOfStock ? (
              <p className="text-sm font-medium text-red-500">在庫切れ</p>
            ) : (
              <p className="text-sm font-medium text-green-600">取り扱い中</p>
            )}
          </div>

          {/* カートに追加（CART-01 実装後に有効化） */}
          <button
            disabled
            className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isOutOfStock ? "在庫切れ" : "カートに追加（準備中）"}
          </button>

          {/* ファイルダウンロード */}
          {(product.files?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">添付ファイル</p>
              <ul className="space-y-1">
                {product.files!.map((file, i) => (
                  <li key={i}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-800"
                    >
                      {file.label ?? `ファイル ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 商品説明 */}
      {product.description && product.description.length > 0 && (
        <div className="mt-10 border-t pt-8">
          <h2 className="mb-4 text-lg font-semibold">商品説明</h2>
          <div className="prose prose-sm max-w-none text-gray-700">
            <PortableText
              value={
                product.description as Parameters<
                  typeof PortableText
                >[0]["value"]
              }
            />
          </div>
        </div>
      )}
    </main>
  );
}
