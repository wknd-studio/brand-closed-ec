import { useCallback, useState } from "react";
import { TextInput } from "@sanity/ui";
import { set, unset } from "sanity";
import type { NumberInputProps } from "sanity";

import { parseYen } from "./product-price-calculator";

export function FormattedYenInput(props: NumberInputProps) {
  const { value, onChange, elementProps } = props;
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const displayValue = isFocused
    ? draft
    : value != null
      ? value.toLocaleString()
      : "";

  const handleFocus = useCallback(() => {
    setDraft(value != null ? String(value) : "");
    setIsFocused(true);
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.currentTarget.value);
    },
    []
  );

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseYen(draft);
    onChange(parsed == null ? unset() : set(parsed));
  }, [draft, onChange]);

  return (
    <TextInput
      {...elementProps}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
