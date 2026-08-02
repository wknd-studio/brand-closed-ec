/**
 * scripts/product-import/vendors/配下のディレクトリ一覧から、実行対象の
 * スクレイピングアダプターだけを抽出する。`__`で始まるディレクトリ
 * （`__fixture__`等、雛形・テスト用）は実業者アダプターではないため除外する。
 */
export function filterAdapterDirectories(directoryNames: string[]): string[] {
  return directoryNames.filter((name) => !name.startsWith("__"));
}
