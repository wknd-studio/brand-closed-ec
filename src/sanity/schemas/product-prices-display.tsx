import { Card, Flex, Stack, Text } from "@sanity/ui";
import type { ObjectInputProps } from "sanity";

import { RANK_OPTIONS, PRICING_RANK_OPTIONS } from "./rank-options";

type RateMap = Partial<Record<string, number>>;

export function ProductPricesDisplay(props: ObjectInputProps) {
  const { value } = props;
  const prices = (value as RateMap | undefined) ?? {};
  const enterprise = RANK_OPTIONS.find((rank) => rank.value === "enterprise");

  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent">
      <Stack space={2}>
        {PRICING_RANK_OPTIONS.map((rank) => (
          <Flex key={rank.value} justify="space-between">
            <Text size={1}>{rank.title}</Text>
            <Text size={1} weight="semibold">
              {prices[rank.value] != null
                ? `¥${prices[rank.value]!.toLocaleString()}`
                : "未設定"}
            </Text>
          </Flex>
        ))}
        {enterprise && prices[enterprise.value] != null && (
          <Flex justify="space-between">
            <Text size={1}>{enterprise.title}（個別契約）</Text>
            <Text size={1} weight="semibold">
              {`¥${prices[enterprise.value]!.toLocaleString()}`}
            </Text>
          </Flex>
        )}
      </Stack>
    </Card>
  );
}
