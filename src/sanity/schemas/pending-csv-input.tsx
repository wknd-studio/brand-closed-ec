import { useCallback } from "react";
import { PatchEvent, set } from "sanity";
import type { FormPatch, ObjectInputProps } from "sanity";

/**
 * pending_csvオブジェクトのカスタム入力。Sanityの`initialValue`は新規ドキュメント作成時にしか
 * 適用されず、既にpublish済みのcsvCatalogドキュメントへ後から保留中CSVを追加する場合、
 * uploaded_atが空のまま保存されてしまう（Studio上での手動保存で実際に発生した不具合）。
 * fileフィールドへの変更を検知したタイミングでuploaded_atも同時にセットすることで、
 * 手動保存・スクレイピングどちらの経路でも確実に日時が入るようにする
 * （sourceは既にreadOnly。fileが変更されるたびに保存日時を更新する）
 */
export function PendingCsvInput(props: ObjectInputProps) {
  const { onChange, renderDefault } = props;

  const handleChange = useCallback(
    (patch: FormPatch | PatchEvent | FormPatch[]) => {
      const patchEvent = PatchEvent.from(patch);
      const touchesFile = patchEvent.patches.some((p) => p.path[0] === "file");
      onChange(
        touchesFile
          ? patchEvent.prepend(set(new Date().toISOString(), ["uploaded_at"]))
          : patchEvent
      );
    },
    [onChange]
  );

  return renderDefault({ ...props, onChange: handleChange });
}
