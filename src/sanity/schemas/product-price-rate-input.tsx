import { useCallback, useEffect, useState } from "react";
import { Box, Card, Flex, Stack, Text, TextInput } from "@sanity/ui";
import { set, useClient, useFormValue } from "sanity";
import type { ObjectInputProps } from "sanity";

import { PRICING_RANK_OPTIONS } from "./rank-options";
import { computeRankPrices } from "./product-price-calculator";

const API_VERSION = "2026-05-17";

type RateMap = Partial<Record<string, number>>;

export function ProductPriceRateInput(props: ObjectInputProps) {
  const { value, onChange } = props;
  const client = useClient({ apiVersion: API_VERSION });
  const documentId = useFormValue(["_id"]) as string | undefined;
  const retailPrice = useFormValue(["retail_price"]) as number | undefined;
  const currentPrices = useFormValue(["prices"]) as RateMap | undefined;
  const [defaultRates, setDefaultRates] = useState<RateMap>({});

  useEffect(() => {
    let cancelled = false;
    client
      .fetch<{
        default_rates?: RateMap;
      } | null>(`*[_type=="priceSettings"][0]{default_rates}`)
      .then((result) => {
        if (!cancelled) setDefaultRates(result?.default_rates ?? {});
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const rates = (value as RateMap | undefined) ?? {};

  const handleRateChange = useCallback(
    (rank: string, rawValue: string) => {
      const parsed = rawValue === "" ? undefined : Number(rawValue);
      const nextRates: RateMap = { ...((value as RateMap | undefined) ?? {}) };
      if (parsed == null || Number.isNaN(parsed)) {
        delete nextRates[rank];
      } else {
        nextRates[rank] = parsed;
      }
      onChange(set(nextRates));

      if (!documentId) return;
      const computedPrices = computeRankPrices(
        retailPrice,
        nextRates,
        defaultRates
      );
      // enterprise等、掛け率対象外で既に入力済みの価格は上書きしない
      const nextPrices: RateMap = { ...currentPrices, ...computedPrices };
      client.patch(documentId).set({ prices: nextPrices }).commit({
        autoGenerateArrayKeys: true,
      });
    },
    [
      value,
      retailPrice,
      defaultRates,
      currentPrices,
      documentId,
      client,
      onChange,
    ]
  );

  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent">
      <Stack space={3}>
        <Text size={1} muted>
          定価に対する掛け率（%）を入力すると、ランク別仕入れ価格が自動計算されます。空欄の場合はデフォルト掛け率が使われます。
        </Text>
        {PRICING_RANK_OPTIONS.map((rank) => {
          const effectiveRate = rates[rank.value] ?? defaultRates[rank.value];
          const computedPrice =
            retailPrice != null && effectiveRate != null
              ? Math.round(retailPrice * (effectiveRate / 100))
              : undefined;
          return (
            <Flex key={rank.value} align="center" gap={3}>
              <Box flex={1}>
                <Text size={1}>{rank.title}</Text>
              </Box>
              <Box flex={1}>
                <TextInput
                  type="number"
                  value={rates[rank.value]?.toString() ?? ""}
                  placeholder={
                    defaultRates[rank.value] != null
                      ? `${defaultRates[rank.value]}（既定）`
                      : "未設定"
                  }
                  onChange={(event) =>
                    handleRateChange(rank.value, event.currentTarget.value)
                  }
                />
              </Box>
              <Box flex={1}>
                <Text size={1} muted>
                  {computedPrice != null
                    ? `¥${computedPrice.toLocaleString()}`
                    : "計算不可（定価未入力）"}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </Stack>
    </Card>
  );
}
