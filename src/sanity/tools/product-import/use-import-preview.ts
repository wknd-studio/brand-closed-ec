import { useCallback, useState } from "react";
import { useClient } from "sanity";

import {
  mapCsvToUnifiedRecords,
  type CsvAdapterVendor,
} from "@/lib/product-import/csv-adapter";
import {
  validateAndPreview,
  type PreviewResult,
  type ValidationError,
} from "@/lib/product-import/validate-and-preview";

const API_VERSION = "2026-05-17";

/**
 * CSVアップロード→検証プレビュー計算を、Sanity Studioの認証済みクライアントを使って行う。
 * apply-import.tsの書き込みと同じ`validateAndPreview`を呼ぶことで、
 * 「検証プレビューで示された見込み件数と実際の実行結果の件数は一致する」を保証する（Edge Cases）。
 */
export function useImportPreview() {
  const client = useClient({ apiVersion: API_VERSION });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runPreview = useCallback(
    async (csvText: string, vendor: CsvAdapterVendor) => {
      setIsLoading(true);
      try {
        const { records, errors: csvErrors } = mapCsvToUnifiedRecords(
          csvText,
          vendor
        );
        const knownBrandNames = await client.fetch<string[]>(
          `*[_type == "brand"].name`
        );
        const preExistingErrors: ValidationError[] = csvErrors.map((e) => ({
          origin: { kind: "csv", rowNumber: e.rowNumber },
          reason: e.reason,
        }));

        const result = validateAndPreview(
          records,
          knownBrandNames,
          preExistingErrors
        );
        setPreview(result);
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  const reset = useCallback(() => setPreview(null), []);

  return { client, preview, isLoading, runPreview, reset };
}
