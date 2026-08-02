import type { SanityClient } from "@sanity/client";

/**
 * 取り込み待ちCSV（productCsvUpload）を取り込み済みに更新する。
 * スクレイピング経由・手元CSV経由のどちらでも、書き込み前の人間による
 * 確認（既存のCSVインポート画面での検証プレビュー→確定）を経由させるための
 * 置き場所としてproductCsvUploadを使うため、確定操作の最後に必ず呼ぶ想定
 */
export async function markCsvUploadImported(
  client: SanityClient,
  uploadId: string
): Promise<void> {
  await client.patch(uploadId).set({ status: "imported" }).commit();
}

/**
 * productCsvUploadのfile assetをブラウザからCSVテキストとして取得する。
 * SanityのアセットはCDN上の直接URLとして認証不要で取得できる
 */
export async function fetchCsvUploadText(assetUrl: string): Promise<string> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error("CSVファイルの取得に失敗しました");
  }
  return response.text();
}
