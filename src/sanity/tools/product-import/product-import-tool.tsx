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
import type { CsvAdapterCatalog } from "@/lib/product-import/csv-adapter";
import {
  fetchCsvUploadText,
  markPendingCsvImported,
} from "@/lib/product-import/csv-upload";
import { describeOrigin } from "@/lib/product-import/unified-product-schema";
import { FileSelectButton } from "@/sanity/components/file-select-button";

import { useImportPreview } from "./use-import-preview";

interface PendingCsv {
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

interface CsvCatalogOption {
  _id: string;
  label: string;
  csv_column_mapping?: CsvAdapterCatalog["columnMapping"];
  defaultBrandName?: string;
  header_row_number?: number;
  pendingCsv?: PendingCsv;
}

type Phase = "idle" | "previewing" | "previewed" | "applying" | "applied";

/**
 * CSVアップロード→検証プレビュー→確定を行うSanity Studioカスタムツール（FR-016, FR-019, User Story 1）。
 * ロジックはsrc/lib/product-import/配下の共有関数（csv-adapter・validate-and-preview・apply-import）を
 * そのまま呼び出す。オンデマンド実行時のプレビュー確認（FR-022）とも同じロジックを共有する。
 * 保留中のCSV（pending_csv）は各csvCatalogドキュメントに1件だけ持つ設計（要確認キュー廃止に伴う
 * ユーザーとの協議による簡素化）のため、カタログ選択と同じクエリで一緒に取得する。
 */
export function ProductImportTool() {
  const { client, preview, isLoading, runPreview, reset } = useImportPreview();
  const [catalogs, setCatalogs] = useState<CsvCatalogOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [applyResult, setApplyResult] = useState<{
    createdCount: number;
    updatedCount: number;
  } | null>(null);
  const [usingPendingCsv, setUsingPendingCsv] = useState(false);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .fetch<CsvCatalogOption[]>(
        `*[_type == "csvCatalog"]{
          _id, label, csv_column_mapping, header_row_number,
          "defaultBrandName": default_brand->name,
          "pendingCsv": pending_csv{
            "fileName": file.asset->originalFilename,
            "fileUrl": file.asset->url,
            "uploadedAt": uploaded_at
          }
        }`
      )
      .then((result) => {
        if (!cancelled) {
          setCatalogs(result);
          setCatalogsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const selectedCatalog = catalogs.find((c) => c._id === selectedCatalogId);

  const handleFileChange = useCallback(
    (file: File) => {
      setFileName(file.name);
      setUsingPendingCsv(false);
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

  const handleUsePendingCsv = useCallback(async () => {
    if (!selectedCatalog?.pendingCsv) return;
    setPhase("idle");
    setApplyResult(null);
    reset();
    setIsLoadingUpload(true);
    try {
      const text = await fetchCsvUploadText(selectedCatalog.pendingCsv.fileUrl);
      setCsvText(text);
      setFileName(selectedCatalog.pendingCsv.fileName);
      setUsingPendingCsv(true);
    } finally {
      setIsLoadingUpload(false);
    }
  }, [selectedCatalog, reset]);

  const handlePreview = useCallback(async () => {
    if (!csvText || !selectedCatalog?.csv_column_mapping) return;
    setPhase("previewing");
    await runPreview(csvText, {
      catalogId: selectedCatalog._id,
      defaultBrandName: selectedCatalog.defaultBrandName,
      columnMapping: selectedCatalog.csv_column_mapping,
      headerRowNumber: selectedCatalog.header_row_number,
    });
    setPhase("previewed");
  }, [csvText, selectedCatalog, runPreview]);

  const handleConfirm = useCallback(async () => {
    if (!preview || preview.outcome !== "ok" || !selectedCatalog) return;
    setPhase("applying");
    const result = await applyImport({
      client,
      catalogId: selectedCatalog._id,
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
    if (usingPendingCsv) {
      await markPendingCsvImported(client, selectedCatalog._id);
      setCatalogs((prev) =>
        prev.map((c) =>
          c._id === selectedCatalog._id ? { ...c, pendingCsv: undefined } : c
        )
      );
      setUsingPendingCsv(false);
    }
    setApplyResult(result);
    setPhase("applied");
  }, [client, preview, selectedCatalog, usingPendingCsv]);

  return (
    <Container width={2} padding={4}>
      <Stack space={4}>
        <Heading size={2}>CSVインポート（商品データ）</Heading>

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
                商品CSVカタログ」で、CSVファイル1本ごとにドキュメントを作成する。CSV列マッピングでサンプルCSVをアップロードすると、実際の列名をプルダウンから選べる。CSVにブランド列が無いデータは「デフォルトブランド」も設定する
              </Text>
              <Text size={1} as="li">
                列名がマッピングと一致するCSVファイルを用意する
              </Text>
              <Text size={1} as="li">
                下の「1. 商品データソースを選択」〜「4.
                実行を確定する」の手順に沿って実行する
              </Text>
              <Text size={1} as="li">
                実行結果は「商品管理 → インポート実行結果」から後で確認できる
              </Text>
            </Stack>
          </Stack>
        </Card>

        {catalogsLoaded && catalogs.length === 0 && (
          <Card padding={3} radius={2} shadow={1} tone="caution">
            <Text size={1}>
              CSV商品データソースがまだ登録されていません。上記の手順2に従って「商品管理
              → 商品CSVカタログ」から先に作成してください。
            </Text>
          </Card>
        )}

        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Text weight="semibold" size={1}>
              1. 商品データソースを選択
            </Text>
            <Select
              value={selectedCatalogId}
              disabled={catalogs.length === 0}
              onChange={(event) => {
                setSelectedCatalogId(event.currentTarget.value);
                setUsingPendingCsv(false);
                setCsvText(null);
                setFileName("");
                setPhase("idle");
                setApplyResult(null);
                reset();
              }}
            >
              <option value="">選択してください</option>
              {catalogs.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.label}
                </option>
              ))}
            </Select>

            <Text weight="semibold" size={1}>
              2. CSVファイルを選択
            </Text>
            {selectedCatalog?.pendingCsv && (
              <>
                <Text size={1} muted>
                  保留中のCSV: {selectedCatalog.pendingCsv.fileName}
                  {selectedCatalog.pendingCsv.uploadedAt &&
                    ` (${selectedCatalog.pendingCsv.uploadedAt.slice(0, 10)})`}
                </Text>
                <Button
                  text="この保留中のCSVを使う"
                  mode="ghost"
                  disabled={isLoadingUpload}
                  onClick={handleUsePendingCsv}
                />
                <Text size={1} muted>
                  または、ブラウザから直接ファイルを選ぶ
                </Text>
              </>
            )}
            <FileSelectButton
              label="CSVファイルを選択"
              accept=".csv,text/csv"
              disabled={!selectedCatalogId}
              onFileSelected={handleFileChange}
            />
            {isLoadingUpload && (
              <Flex align="center" gap={2}>
                <Spinner /> <Text size={1}>CSVファイルを取得中...</Text>
              </Flex>
            )}
            {fileName && !isLoadingUpload && (
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
              disabled={!csvText || !selectedCatalogId || isLoading}
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
