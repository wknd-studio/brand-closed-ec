import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
} from "@sanity/ui";

import { applyImport } from "@/lib/product-import/apply-import";
import type { CsvAdapterVendor } from "@/lib/product-import/csv-adapter";
import { describeOrigin } from "@/lib/product-import/unified-product-schema";

import { useImportPreview } from "./use-import-preview";

interface VendorOption {
  _id: string;
  name: string;
  csv_column_mapping?: CsvAdapterVendor["columnMapping"];
  defaultBrandName?: string;
}

type Phase = "idle" | "previewing" | "previewed" | "applying" | "applied";

/**
 * CSVアップロード→検証プレビュー→確定を行うSanity Studioカスタムツール（FR-016, FR-019, User Story 1）。
 * ロジックはsrc/lib/product-import/配下の共有関数（csv-adapter・validate-and-preview・apply-import）を
 * そのまま呼び出す。オンデマンド実行時のプレビュー確認（FR-022）とも同じロジックを共有する。
 */
export function ProductImportTool() {
  const { client, preview, isLoading, runPreview, reset } = useImportPreview();
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [applyResult, setApplyResult] = useState<{
    createdCount: number;
    updatedCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .fetch<VendorOption[]>(
        `*[_type == "vendor" && data_source_type == "csv"]{
          _id, name, csv_column_mapping, "defaultBrandName": default_brand->name
        }`
      )
      .then((result) => {
        if (!cancelled) {
          setVendors(result);
          setVendorsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const selectedVendor = vendors.find((v) => v._id === selectedVendorId);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setCsvText(String(reader.result ?? ""));
        setPhase("idle");
        setApplyResult(null);
        reset();
      };
      reader.readAsText(file);
    },
    [reset]
  );

  const handlePreview = useCallback(async () => {
    if (!csvText || !selectedVendor?.csv_column_mapping) return;
    setPhase("previewing");
    await runPreview(csvText, {
      vendorId: selectedVendor._id,
      defaultBrandName: selectedVendor.defaultBrandName,
      columnMapping: selectedVendor.csv_column_mapping,
    });
    setPhase("previewed");
  }, [csvText, selectedVendor, runPreview]);

  const handleConfirm = useCallback(async () => {
    if (!preview || preview.outcome !== "ok" || !selectedVendor) return;
    setPhase("applying");
    const result = await applyImport({
      client,
      vendorId: selectedVendor._id,
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: preview.validRecords,
      failureCount: preview.errorCount,
      errorDetails: preview.errors.map((e) => ({
        target: describeOrigin(e.origin),
        reason: e.reason,
      })),
    });
    setApplyResult(result);
    setPhase("applied");
  }, [client, preview, selectedVendor]);

  return (
    <Container width={2} padding={4}>
      <Stack space={4}>
        <Heading size={2}>CSVインポート（業者商品データ）</Heading>

        <Card padding={3} radius={2} shadow={1} tone="primary">
          <Stack space={3}>
            <Text weight="semibold" size={1}>
              使い方
            </Text>
            <Stack space={2} as="ol" style={{ paddingLeft: "1.25em" }}>
              <Text size={1} as="li">
                商品のブランドが未登録の場合は、先に「商品管理 →
                ブランド」で作成する
              </Text>
              <Text size={1} as="li">
                「商品管理 →
                業者」で、CSVを提供してくれる業者ごとにドキュメントを作成する。データ提供区分は「CSV提供」、CSV列マッピングに実際のCSVのヘッダー名を入力する（例:
                商品名列が「品名」なら商品名列名に「品名」と入力）。CSVにブランド列が無い業者は「デフォルトブランド」も設定する
              </Text>
              <Text size={1} as="li">
                列名がマッピングと一致するCSVファイルを用意する
              </Text>
              <Text size={1} as="li">
                下の「1. 業者を選択」〜「4.
                実行を確定する」の手順に沿って実行する
              </Text>
              <Text size={1} as="li">
                実行結果は「商品管理 → インポート実行結果」から後で確認できる
              </Text>
            </Stack>
          </Stack>
        </Card>

        {vendorsLoaded && vendors.length === 0 && (
          <Card padding={3} radius={2} shadow={1} tone="caution">
            <Text size={1}>
              CSV提供業者がまだ登録されていません。上記の手順2に従って「商品管理
              → 業者」から先に業者を作成してください。
            </Text>
          </Card>
        )}

        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold" size={1}>
              1. 業者を選択
            </Text>
            <Select
              value={selectedVendorId}
              disabled={vendors.length === 0}
              onChange={(event) => {
                setSelectedVendorId(event.currentTarget.value);
                setPhase("idle");
                setApplyResult(null);
                reset();
              }}
            >
              <option value="">選択してください</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </Select>

            <Text weight="semibold" size={1}>
              2. CSVファイルを選択
            </Text>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={!selectedVendorId}
            />
            {fileName && (
              <Text size={1} muted>
                選択中: {fileName}
              </Text>
            )}

            <Text weight="semibold" size={1}>
              3. 検証プレビューを表示する
            </Text>
            <Button
              text="検証プレビューを表示する"
              tone="primary"
              disabled={!csvText || !selectedVendorId || isLoading}
              onClick={handlePreview}
            />
            <Text muted size={1}>
              クリックすると、書き込み前に成功見込み・エラー見込み件数が表示されます（下記「4.
              実行を確定する」を押すまで、Sanity上の商品データは変更されません）。
            </Text>
          </Stack>
        </Card>

        {isLoading && (
          <Flex align="center" gap={2}>
            <Spinner /> <Text size={1}>検証中...</Text>
          </Flex>
        )}

        {preview && phase !== "applied" && (
          <Card
            padding={3}
            radius={2}
            shadow={1}
            tone={preview.outcome === "ok" ? "positive" : "critical"}
          >
            <Stack space={3}>
              <Flex gap={2} align="center">
                <Badge
                  tone={preview.outcome === "ok" ? "positive" : "critical"}
                >
                  {preview.outcome === "ok"
                    ? "実行可能"
                    : "エラー率超過のため中止"}
                </Badge>
                <Text size={1}>
                  成功見込み: {preview.successCount}件 / エラー見込み:{" "}
                  {preview.errorCount}件
                </Text>
              </Flex>

              {preview.errors.length > 0 && (
                <Stack space={2}>
                  <Text size={1} weight="semibold">
                    エラー詳細
                  </Text>
                  {preview.errors.map((e, i) => (
                    <Text key={i} size={1} muted>
                      {describeOrigin(e.origin)}: {e.reason}
                    </Text>
                  ))}
                </Stack>
              )}

              {preview.outcome === "ok" && (
                <Box>
                  <Text weight="semibold" size={1}>
                    4. 実行を確定する
                  </Text>
                  <Box marginTop={2}>
                    <Button
                      text="実行を確定する"
                      tone="positive"
                      disabled={phase === "applying"}
                      onClick={handleConfirm}
                    />
                  </Box>
                </Box>
              )}
            </Stack>
          </Card>
        )}

        {applyResult && (
          <Card padding={3} radius={2} shadow={1} tone="positive">
            <Text size={1}>
              完了しました。新規作成: {applyResult.createdCount}件 / 更新:{" "}
              {applyResult.updatedCount}件
            </Text>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
