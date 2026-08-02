import { Card, Stack, Text } from "@sanity/ui";
import type { ArrayOfObjectsInputProps } from "sanity";

interface ErrorDetailItem {
  target?: string;
  reason?: string;
}

/**
 * error_detailsを、Sanityのデフォルトの配列UI（各要素が個別ページになり
 * クリックしないと中身が見えない）ではなく、単純なエラーログ形式で
 * 一覧表示する読み取り専用コンポーネント（インポート実行結果は編集不可のため）。
 */
export function ImportErrorLogDisplay(props: ArrayOfObjectsInputProps) {
  const { value } = props;
  const items = (value as ErrorDetailItem[] | undefined) ?? [];

  if (items.length === 0) {
    return (
      <Card padding={3} radius={2} shadow={1} tone="positive">
        <Text size={1} muted>
          エラーはありません
        </Text>
      </Card>
    );
  }

  return (
    <Card padding={3} radius={2} shadow={1} tone="critical">
      <Stack space={2}>
        {items.map((item, index) => (
          <Text key={index} size={1} style={{ fontFamily: "monospace" }}>
            {(item.target ?? "（対象不明）") +
              ": " +
              (item.reason ?? "（理由不明）")}
          </Text>
        ))}
      </Stack>
    </Card>
  );
}
