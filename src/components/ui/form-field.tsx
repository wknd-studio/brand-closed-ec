import { useId, type ReactNode } from "react";

// 子の入力欄（Input・Select 等）にそのまま展開する属性
type FieldControlProps = {
  id: string;
  error?: string;
  "aria-describedby"?: string;
};

type FormFieldProps = {
  label: ReactNode;
  error?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

// ラベル・入力欄・項目ごとのエラー文言を組にし、ラベルの htmlFor と
// エラー文言の aria-describedby を自動で結び付ける
export function FormField({
  label,
  error,
  className,
  children,
}: FormFieldProps) {
  const controlId = useId();
  const errorId = `${controlId}-error`;

  return (
    <div className={className}>
      <label
        htmlFor={controlId}
        className="mb-1 block text-sm font-medium text-neutral-700"
      >
        {label}
      </label>
      {children({
        id: controlId,
        error,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
