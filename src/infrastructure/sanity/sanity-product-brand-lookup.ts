import { sanityClient } from "@/infrastructure/sanity/client";

// 商品IDからブランド名への対応を返す。ブランドが無い・Sanity から消えた商品は含めない
export async function findBrandNamesByProductIds(
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const products = await sanityClient.fetch<
    { _id: string; brand: string | null }[]
  >(`*[_type=="product"&&_id in $ids]{_id,"brand":brand->name}`, { ids });

  return new Map(
    products.flatMap((p) => (p.brand ? [[p._id, p.brand] as const] : []))
  );
}
