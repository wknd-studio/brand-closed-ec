import { useRef } from "react";
import { Button } from "@sanity/ui";

interface FileSelectButtonProps {
  label: string;
  accept?: string;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
}

/**
 * ネイティブの<input type="file">が表示する「Choose File」等のボタン文言は
 * ブラウザ自身のUI言語に依存し、ページ側から日本語化できない。そのため実際の
 * inputは非表示にし、Sanity UIのButtonをクリックで発火させる形で日本語ラベルの
 * ボタンとして見せる。
 */
export function FileSelectButton({
  label,
  accept,
  disabled,
  onFileSelected,
}: FileSelectButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        text={label}
        mode="ghost"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 同じファイルを選び直したときもonChangeが発火するようにリセットする
          event.target.value = "";
          if (file) onFileSelected(file);
        }}
      />
    </>
  );
}
