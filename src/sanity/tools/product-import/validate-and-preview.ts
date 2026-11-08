import { IMPORT_ERROR_THRESHOLD_RATIO } from "./config";
import type { UnifiedProductRecord } from "./unified-product-schema";

export interface ValidationError {
  origin: UnifiedProductRecord["origin"];
  reason: string;
}

export interface PreviewResult {
  outcome: "ok" | "aborted_error_threshold";
  successCount: number;
  errorCount: number;
  /** outcomeが"aborted_error_threshold"の場合は空になる（一切書き込みを行わないため） */
  validRecords: UnifiedProductRecord[];
  errors: ValidationError[];
}

/**
 * インポート実行前の検証・プレビュー計算（FR-006, FR-019, FR-020, Edge Cases）。
 * CSVインポート・オンデマンド実行・定期実行のいずれからも同じロジックを使うことで、
 * 「検証プレビューで示された見込み件数と実際の実行結果の件数は一致する」を保証する。
 */
export function validateAndPreview(
  records: UnifiedProductRecord[],
  knownBrandNames: string[],
  /**
   * csv-adapter等、このバッチに渡ってくる前段の処理で既にエラーとして弾かれた行
   * （例: ブランド列が読み取れない等）。エラー率の分母・分子の両方に含めないと、
   * 実際のCSV全体に対するエラー率を過小評価してしまう（FR-020）
   */
  preExistingErrors: ValidationError[] = []
): PreviewResult {
  const errors: ValidationError[] = [...preExistingErrors];
  const candidates: UnifiedProductRecord[] = [];

  for (const record of records) {
    const reason = validateRecord(record, knownBrandNames);
    if (reason) {
      errors.push({ origin: record.origin, reason });
    } else {
      candidates.push(record);
    }
  }

  const { valid, duplicateErrors } = resolveDuplicateJanCodes(candidates);
  errors.push(...duplicateErrors);

  const totalCount = records.length + preExistingErrors.length;
  const errorRatio = totalCount === 0 ? 0 : errors.length / totalCount;

  if (errorRatio > IMPORT_ERROR_THRESHOLD_RATIO) {
    return {
      outcome: "aborted_error_threshold",
      successCount: 0,
      errorCount: errors.length,
      validRecords: [],
      errors,
    };
  }

  return {
    outcome: "ok",
    successCount: valid.length,
    errorCount: errors.length,
    validRecords: valid,
    errors,
  };
}

function validateRecord(
  record: UnifiedProductRecord,
  knownBrandNames: string[]
): string | undefined {
  if (!record.name) return "商品名が未入力です";
  if (!record.brandName) return "ブランド名が未入力です";
  if (!(record.retailPrice > 0))
    return "定価が不正です（0円以下、または未入力）";
  if (!knownBrandNames.includes(record.brandName)) {
    return `ブランド「${record.brandName}」が既存のブランドと一致しません`;
  }
  return undefined;
}

/** バッチ内で同じJANコードが複数行ある場合、後の行を有効としそれ以外をエラーにする（Edge Cases） */
function resolveDuplicateJanCodes(records: UnifiedProductRecord[]): {
  valid: UnifiedProductRecord[];
  duplicateErrors: ValidationError[];
} {
  const lastIndexByJanCode = new Map<string, number>();
  records.forEach((record, index) => {
    if (record.janCode) lastIndexByJanCode.set(record.janCode, index);
  });

  const valid: UnifiedProductRecord[] = [];
  const duplicateErrors: ValidationError[] = [];

  records.forEach((record, index) => {
    const isSupersededDuplicate =
      record.janCode !== undefined &&
      lastIndexByJanCode.get(record.janCode) !== index;

    if (isSupersededDuplicate) {
      duplicateErrors.push({
        origin: record.origin,
        reason: `JANコード「${record.janCode}」がバッチ内で重複しています（後の行を優先）`,
      });
      return;
    }
    valid.push(record);
  });

  return { valid, duplicateErrors };
}
