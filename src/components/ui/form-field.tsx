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
  // 入力のヒント。エラーがあるときはエラー文言に置き換える
  hint?: string;
  // ラベルに「必須」の印を付ける。入力欄の required は子に別に渡す
  required?: boolean;
  // 画面上部のエラーのまとめ等から入力欄へリンクするときに渡す。無ければ useId で振る
  id?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

// ラベル・入力欄・ヒント・項目ごとのエラー文言を組にし、ラベルの htmlFor と
// ヒント・エラー文言の aria-describedby を自動で結び付ける
export function FormField({
  label,
  error,
  hint,
  required = false,
  id,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-2">
        <label
          htmlFor={controlId}
          className="text-sm font-medium text-neutral-700"
        >
          {label}
        </label>
        {required && (
          // ラベルの外に置き、ラベルの文字列（getByLabel("姓", { exact: true }) 等）を変えない。
          // 読み上げは入力欄の required に任せる
          <span
            aria-hidden="true"
            className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary-strong"
          >
            必須
          </span>
        )}
      </div>
      {children({
        id: controlId,
        error,
        "aria-describedby": describedBy,
      })}
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1 text-xs text-secondary">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
