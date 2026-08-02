import { TextInput } from "@sanity/ui";
import type { StringInputProps } from "sanity";

/**
 * Sanityのstring/url型フィールドは標準でプレースホルダーを指定できないため、
 * 入力例をグレーテキストで示すための薄いラッパー。
 * `components: { input: createPlaceholderTextInput("例: https://example.com") }` のように使う。
 */
export function createPlaceholderTextInput(placeholder: string) {
  return function PlaceholderTextInput(props: StringInputProps) {
    return <TextInput {...props.elementProps} placeholder={placeholder} />;
  };
}
