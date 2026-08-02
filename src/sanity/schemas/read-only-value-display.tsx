import { Card, Text } from "@sanity/ui";
import type { NumberInputProps, StringInputProps } from "sanity";

type ScalarInputProps = StringInputProps | NumberInputProps;

/**
 * インポート実行結果（productImportRun）のように、フィールドが常にreadOnlyで
 * 二度と編集されることのないドキュメントで、Sanity標準の入力コンポーネント
 * （テキストボックス・セレクトボックス等、disabled状態でも入力欄の見た目になる）
 * をそのまま使うと「入力できそうに見えるのに入力できない」という冗長なUIになるため、
 * 単純なテキスト表示に置き換える。
 */
export function createReadOnlyValueDisplay(options?: {
  labelByValue?: Record<string, string>;
  formatValue?: (value: string | number) => string;
}) {
  return function ReadOnlyValueDisplay(props: ScalarInputProps) {
    const { value } = props;
    const display =
      value == null
        ? "—"
        : (options?.labelByValue?.[String(value)] ??
          options?.formatValue?.(value) ??
          String(value));

    return (
      <Card padding={2} radius={2} tone="transparent">
        <Text size={1}>{display}</Text>
      </Card>
    );
  };
}

export const ReadOnlyDatetimeDisplay = createReadOnlyValueDisplay({
  formatValue: (value) => new Date(value).toLocaleString("ja-JP"),
});
