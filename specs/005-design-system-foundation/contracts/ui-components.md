# Contract: プリミティブコンポーネントのProps

この機能における「契約」は、外部APIではなく、他の画面実装コードが依存する各コンポーネントのProps型である。ここで定義した名前・型は、後続の画面適用フィーチャーからの利用契約として扱う。

## Button

```ts
type ButtonProps = {
  variant?: "primary" | "secondary" | "danger"; // default: "primary"
  disabled?: boolean;
  type?: "button" | "submit" | "reset"; // default: "button"
  onClick?: () => void;
  children: React.ReactNode;
};
```

## Input

```ts
type InputProps = {
  name: string;
  type?: "text" | "email" | "tel" | "password"; // default: "text"
  disabled?: boolean;
  error?: string; // 指定するとaria-invalid=trueかつエラー表示になる
  placeholder?: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "required">;
```

## Checkbox / Radio

```ts
type CheckboxProps = {
  name: string;
  label: string; // getByRole(..., { name: label }) と対応させるため必須
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
};

type RadioProps = {
  name: string;
  value: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
};
```

## Select

```ts
type SelectOption = { value: string; label: string };

type SelectProps = {
  name: string;
  options: SelectOption[];
  disabled?: boolean;
  error?: string;
} & Pick<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue" | "onChange" | "required">;
```

## 契約上の保証

- 全コンポーネントで `name` を受け取るもの（Input/Checkbox/Radio/Select）は、その値をレンダリングされるネイティブ要素の`name`属性にそのまま反映する（既存E2Eの`locator('input[name="..."]')`パターンとの互換性維持のため）
- `label`を受け取るもの（Checkbox/Radio）は、`getByRole(role, { name: label })`で取得可能な形（`aria-label`または関連付けられた`<label>`）でレンダリングする
