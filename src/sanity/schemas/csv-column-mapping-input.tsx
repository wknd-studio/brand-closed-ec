import { useCallback, useState } from "react";
import Papa from "papaparse";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Select,
  Stack,
  Text,
  TextInput,
} from "@sanity/ui";
import { set, unset, useClient, useFormValue } from "sanity";
import type { ObjectInputProps } from "sanity";

const API_VERSION = "2026-05-17";

type MappingValue = Partial<Record<string, string>>;

const TARGET_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "商品名", required: true },
  { key: "brand_name", label: "ブランド名" },
  { key: "retail_price", label: "定価", required: true },
  { key: "jan_code", label: "JANコード" },
  { key: "availability", label: "在庫状況" },
  { key: "vendor_cost_rate", label: "仕入れ掛け率" },
  { key: "case_quantity", label: "入数" },
];

const PREVIEW_ROW_COUNT = 10;

/**
 * CSV列マッピングの入力を、業者名の手打ちではなく表形式で行えるようにするカスタム入力（FR-002）。
 * サンプルCSVをアップロードすると、先頭数行のプレビューからヘッダー行を選択でき（案内文や
 * 空行が先頭にあるCSVに対応するため。実際の業者CSVで判明した課題）、選んだヘッダー行の
 * 実際の列名をプルダウンから選べるようにする（タイプミス防止・どの列が何にマッピングされて
 * いるかを一目で分かるようにするため。アップロードしたファイル自体は保存しない）。
 */
export function CsvColumnMappingInput(props: ObjectInputProps) {
  const { value, onChange } = props;
  const client = useClient({ apiVersion: API_VERSION });
  const documentId = useFormValue(["_id"]) as string | undefined;
  const headerRowNumber =
    (useFormValue(["header_row_number"]) as number | undefined) ?? 1;

  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");

  const currentMapping = (value as MappingValue | undefined) ?? {};
  const headers = previewRows ? (previewRows[headerRowNumber - 1] ?? []) : null;

  const handleSampleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
        setPreviewRows((parsed.data as string[][]).slice(0, PREVIEW_ROW_COUNT));
      };
      reader.readAsText(file);
    },
    []
  );

  const handleHeaderRowSelect = useCallback(
    (rowNumber: number) => {
      if (!documentId) return;
      // header_row_numberはcsv_column_mappingの兄弟フィールドのため、
      // このフィールドのonChangeでは更新できずclientから直接patchする
      // （ProductPriceRateInputが兄弟フィールドpricesを更新するのと同じパターン）
      client
        .patch(documentId)
        .set({ header_row_number: rowNumber })
        .commit({ autoGenerateArrayKeys: true });
    },
    [client, documentId]
  );

  const handleMappingChange = useCallback(
    (key: string, headerValue: string) => {
      const current: MappingValue = { ...((value as MappingValue) ?? {}) };
      if (!headerValue) {
        delete current[key];
      } else {
        current[key] = headerValue;
      }
      onChange(Object.keys(current).length > 0 ? set(current) : unset());
    },
    [value, onChange]
  );

  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent">
      <Stack space={3}>
        <Text size={1} muted>
          サンプルCSVをアップロードすると、実際の列名をプルダウンから選べます（アップロードしたファイル自体は保存されません）。アップロードしなくても列名を直接入力できます。
        </Text>
        <input type="file" accept=".csv,text/csv" onChange={handleSampleFile} />
        {fileName && (
          <Text size={1} muted>
            読み込み済み: {fileName}
          </Text>
        )}

        {previewRows && previewRows.length > 0 && (
          <Stack space={2}>
            <Text size={1} weight="semibold">
              ヘッダー行を選択
            </Text>
            <Text size={1} muted>
              案内文や空行が先頭にあるCSVもあるため、実際に項目名が並んでいる行を選んでください。
            </Text>
            <Stack space={1}>
              {previewRows.map((row, index) => {
                const rowNumber = index + 1;
                const isSelected = rowNumber === headerRowNumber;
                return (
                  <Flex key={rowNumber} align="center" gap={2}>
                    <Button
                      fontSize={1}
                      padding={2}
                      mode={isSelected ? "default" : "ghost"}
                      tone={isSelected ? "primary" : "default"}
                      text={`${rowNumber}行目`}
                      onClick={() => handleHeaderRowSelect(rowNumber)}
                    />
                    {isSelected && <Badge tone="primary">ヘッダー</Badge>}
                    <Text
                      size={1}
                      muted
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.filter(Boolean).join(" / ") || "(空行)"}
                    </Text>
                  </Flex>
                );
              })}
            </Stack>
          </Stack>
        )}

        <Stack space={2}>
          {TARGET_FIELDS.map((field) => (
            <Flex key={field.key} align="center" gap={3}>
              <Box flex={1}>
                <Text size={1}>
                  {field.label}
                  {field.required && " *"}
                </Text>
              </Box>
              <Box flex={2}>
                {headers && headers.length > 0 ? (
                  <Select
                    value={currentMapping[field.key] ?? ""}
                    onChange={(event) =>
                      handleMappingChange(field.key, event.currentTarget.value)
                    }
                  >
                    <option value="">（この項目は無い）</option>
                    {headers.map(
                      (header, index) =>
                        header && (
                          <option key={`${header}-${index}`} value={header}>
                            {header}
                          </option>
                        )
                    )}
                  </Select>
                ) : (
                  <TextInput
                    placeholder="サンプルCSVをアップロードすると選択式になります"
                    value={currentMapping[field.key] ?? ""}
                    onChange={(event) =>
                      handleMappingChange(field.key, event.currentTarget.value)
                    }
                  />
                )}
              </Box>
            </Flex>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
