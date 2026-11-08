import type { SanityClient } from "@sanity/client";

/**
 * csvCatalogの`pending_csv`（保留中のCSV）フィールドを取り込み済みとしてクリアする。
 * スクレイピング経由・手元CSV経由のどちらでも、書き込み前の人間による
 * 確認（既存のCSVインポート画面での検証プレビュー→確定）を経由させるための
 * 一時置き場としてpending_csvを使うため、確定操作の最後に必ず呼ぶ想定
 */
export async function markPendingCsvImported(
  client: SanityClient,
  catalogId: string
): Promise<void> {
  await client.patch(catalogId).unset(["pending_csv"]).commit();
}

/**
 * pending_csv.fileのfile assetをブラウザからCSVテキストとして取得する。
 * SanityのアセットはCDN上の直接URLとして認証不要で取得できる
 */
export async function fetchCsvUploadText(assetUrl: string): Promise<string> {
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error("CSVファイルの取得に失敗しました");
  }
  return response.text();
}
