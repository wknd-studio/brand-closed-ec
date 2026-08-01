import { useCallback, useState } from "react";
import Papa from "papaparse";
import { Box, Card, Flex, Select, Stack, Text, TextInput } from "@sanity/ui";
import { set, unset } from "sanity";
import type { ObjectInputProps } from "sanity";

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

/**
 * CSV列マッピングの入力を、業者名の手打ちではなく表形式で行えるようにするカスタム入力（FR-002）。
 * サンプルCSVをアップロードすると実際のヘッダー行を検出し、プルダウンから選べるようにする
 * （タイプミス防止・どの列が何にマッピングされているかを一目で分かるようにするため。
 * アップロードしたファイル自体は保存しない）。
 */
export function CsvColumnMappingInput(props: ObjectInputProps) {
  const { value, onChange } = props;
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState("");

  const currentMapping = (value as MappingValue | undefined) ?? {};

  const handleSampleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        const parsed = Papa.parse<string[]>(text, { preview: 1 });
        setHeaders((parsed.data[0] as string[] | undefined) ?? []);
      };
      reader.readAsText(file);
    },
    []
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
            読み込み済み: {fileName}（{headers?.length ?? 0}列を検出）
          </Text>
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
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
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
