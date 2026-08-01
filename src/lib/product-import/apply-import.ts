import type { SanityClient } from "@sanity/client";

import { validatePrices } from "@/sanity/schemas/product";
import {
  computeRankPrices,
  pickEffectivePriceSettingsRates,
} from "@/sanity/schemas/product-price-calculator";

import { findMatchingProduct, type ExistingProductRef } from "./dedupe";
import {
  describeOrigin,
  type UnifiedProductRecord,
} from "./unified-product-schema";

type RateMap = Partial<Record<string, number>>;

export interface ApplyImportErrorDetail {
  target: string;
  reason: string;
}

export interface ApplyImportOptions {
  client: SanityClient;
  catalogId: string;
  triggeredBy: "scheduled" | "on_demand" | "manual_csv";
  startedAt: Date;
  outcome: "completed" | "aborted_error_threshold" | "failed";
  validRecords: UnifiedProductRecord[];
  failureCount: number;
  needsReviewCount?: number;
  errorDetails?: ApplyImportErrorDetail[];
}

export interface ApplyImportResult {
  createdCount: number;
  updatedCount: number;
  importRunId: string;
}

/**
 * 検証済みのUnifiedProductRecordをSanityの`product`へcreate/updateし、
 * `productImportRun`として実行結果を記録する（FR-001, FR-004/005, FR-015, FR-023）。
 * Sanity Studioカスタムツール（ブラウザの認証済みクライアント）・GitHub Actions上の
 * スクリプト（Node製クライアント）のどちらから呼ばれても同じロジックで動作する
 * （research.md #1参照）。
 */
export async function applyImport(
  options: ApplyImportOptions
): Promise<ApplyImportResult> {
  const { client, validRecords } = options;

  const [existingProducts, brandContext] = await Promise.all([
    fetchExistingProducts(client),
    fetchBrandPricingContext(client),
  ]);

  let createdCount = 0;
  let updatedCount = 0;
  const costFloorErrors: ApplyImportErrorDetail[] = [];

  for (const record of validRecords) {
    const brandId = brandContext.brandIdByName[record.brandName];
    if (!brandId) {
      // validate-and-preview.tsで既存ブランドとの一致を検証済みのため、
      // ここに到達する場合はブランドマスタが検証後に変更された等の想定外ケース
      throw new Error(`ブランドIDが見つかりません: ${record.brandName}`);
    }

    // 会員向けのランク別価格は、業者の仕入れ掛け率(vendorCostRate)には一切影響されず、
    // 常にブランド・全体のデフォルト掛け率設定から計算する（インポートのたびに担当者が
    // Studio上で手動調整した price_rates を上書きしないため。この対話で合意した方針）
    const effectiveDefaultRates = pickEffectivePriceSettingsRates({
      ownRates: undefined,
      brandRates:
        brandContext.priceSettingsRatesById[
          brandContext.brandPriceSettingsRefById[brandId] ?? ""
        ],
      defaultRates: brandContext.defaultPriceSettingsRates,
    });
    const prices = computeRankPrices(
      record.retailPrice,
      {},
      effectiveDefaultRates
    );

    // Sanityのフィールドバリデーションはapiからの直接書き込みには効かないため、
    // 同じチェック(validatePrices)をここでも実行し、仕入れ値を下回る場合は
    // 書き込みを行わずエラーとして扱う（この対話で合意した方針: 保存をブロック）
    const priceCheck = validatePrices(prices, {
      is_negotiable: false,
      retail_price: record.retailPrice,
      vendor_cost_rate: record.vendorCostRate,
    });
    if (priceCheck !== true) {
      costFloorErrors.push({
        target: describeOrigin(record.origin, record.name),
        reason: priceCheck,
      });
      continue;
    }

    const doc = {
      name: record.name,
      brand: { _type: "reference" as const, _ref: brandId },
      retail_price: record.retailPrice,
      is_negotiable: false,
      // schemaのinitialValueはStudioのフォーム入力時のみ適用され、client.create()に
      // よるAPI経由の書き込みには効かないため、ここで明示的に既定値を設定する。
      // 未設定のままだとインポート後に商品ごとの手動設定が必要になり運用負荷が高い
      payment_timing: "at_order" as const,
      prices,
      min_rank: record.minRank ?? "starter",
      availability: record.availability,
      jan_code: record.janCode,
      vendor_cost_rate: record.vendorCostRate,
      case_quantity: record.caseQuantity,
      source_catalog: {
        _type: "reference" as const,
        _ref: options.catalogId,
      },
    };

    const match = findMatchingProduct(record, existingProducts);
    if (match.matched) {
      await client.patch(match.productId).set(doc).commit();
      updatedCount += 1;
    } else {
      await client.create({ _type: "product", ...doc });
      createdCount += 1;
    }
  }

  const importRun = await client.create({
    _type: "productImportRun",
    catalog: { _type: "reference", _ref: options.catalogId },
    triggered_by: options.triggeredBy,
    started_at: options.startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    outcome: options.outcome,
    success_count: createdCount + updatedCount,
    failure_count: options.failureCount + costFloorErrors.length,
    needs_review_count: options.needsReviewCount ?? 0,
    error_details: [...(options.errorDetails ?? []), ...costFloorErrors],
  });

  return { createdCount, updatedCount, importRunId: importRun._id };
}

async function fetchExistingProducts(
  client: SanityClient
): Promise<ExistingProductRef[]> {
  return client.fetch(
    `*[_type == "product"]{ _id, "janCode": jan_code, name, "brandName": brand->name }`
  );
}

interface BrandPricingContext {
  brandIdByName: Record<string, string>;
  brandPriceSettingsRefById: Record<string, string | undefined>;
  priceSettingsRatesById: Record<string, RateMap>;
  defaultPriceSettingsRates: RateMap;
}

async function fetchBrandPricingContext(
  client: SanityClient
): Promise<BrandPricingContext> {
  const [brands, priceSettingsDocs] = await Promise.all([
    client.fetch<{ _id: string; name: string; priceSettingsRef?: string }[]>(
      `*[_type == "brand"]{ _id, name, "priceSettingsRef": price_settings._ref }`
    ),
    client.fetch<
      { _id: string; is_default?: boolean; default_rates?: RateMap }[]
    >(`*[_type == "priceSettings"]{ _id, is_default, default_rates }`),
  ]);

  const brandIdByName: Record<string, string> = {};
  const brandPriceSettingsRefById: Record<string, string | undefined> = {};
  for (const brand of brands) {
    brandIdByName[brand.name] = brand._id;
    brandPriceSettingsRefById[brand._id] = brand.priceSettingsRef;
  }

  const priceSettingsRatesById: Record<string, RateMap> = {};
  let defaultPriceSettingsRates: RateMap = {};
  for (const settings of priceSettingsDocs) {
    priceSettingsRatesById[settings._id] = settings.default_rates ?? {};
    if (settings.is_default) {
      defaultPriceSettingsRates = settings.default_rates ?? {};
    }
  }

  return {
    brandIdByName,
    brandPriceSettingsRefById,
    priceSettingsRatesById,
    defaultPriceSettingsRates,
  };
}
