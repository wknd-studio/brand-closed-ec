#!/usr/bin/env python3
"""
supabase/config.toml のproject_id・全ポートを、worktreeスロット番号に応じて
一意な値へローカル書き換えする（並列worktree実行時のDocker/ポート衝突を防ぐ）。

このスクリプトが書き換えるのは、そのworktree自身のワーキングツリー内の
config.tomlのみ。他worktree・コミット履歴には一切影響しない。
呼び出し側（scripts/worktree-setup.sh）が、書き換え後に
`git update-index --skip-worktree supabase/config.toml` を実行し、
誤ってこのローカル専用の変更をコミットしてしまわないようにする。

使い方: patch-supabase-slot.py <config.tomlのパス> <スロット番号 1-4>
スロット1は素の設定のまま（オフセット0）。2〜4はポートを1000刻みでずらす。
"""
import re
import sys

# (セクションヘッダー, キー名) -> パッチ対象のポート系キー一覧。
# セクションヘッダーは正規表現の "[" 開始行と完全一致で判定する。
PORT_KEYS = {
    ("[api]", "port"): 54321,
    ("[db]", "port"): 54322,
    ("[db]", "shadow_port"): 54320,
    ("[db.pooler]", "port"): 54329,
    ("[studio]", "port"): 54323,
    ("[inbucket]", "port"): 54324,
    ("[analytics]", "port"): 54327,
    ("[edge_runtime]", "inspector_port"): 8083,
}

APP_PORT_BASE = 3000


def patch(path: str, slot: int) -> None:
    if slot < 1 or slot > 4:
        raise SystemExit(f"スロットは1〜4の範囲で指定してください: {slot}")

    offset = (slot - 1) * 1000
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    current_section = None
    out = []
    for line in lines:
        stripped = line.strip()
        # コメント行・空行はセクション判定・置換の対象外
        if stripped.startswith("["):
            current_section = stripped
            out.append(line)
            continue
        if stripped.startswith("#"):
            out.append(line)
            continue

        if current_section == "" or current_section is None:
            out.append(line)
            continue

        # project_id はトップレベル（セクション外）にあるため別扱い
        matched = False
        for (section, key), base_value in PORT_KEYS.items():
            if current_section != section:
                continue
            m = re.match(rf"^(\s*{re.escape(key)}\s*=\s*){base_value}(\s*)$", line)
            if m:
                new_value = base_value + offset
                out.append(f"{m.group(1)}{new_value}{m.group(2)}")
                matched = True
                break
        if not matched:
            out.append(line)

    # project_id（セクション外のトップレベル行）
    text = "".join(out)
    text = re.sub(
        r'^project_id = "([^"]+)"$',
        lambda m: f'project_id = "{m.group(1)}-slot{slot}"' if slot != 1 else m.group(0),
        text,
        count=1,
        flags=re.MULTILINE,
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

    app_port = APP_PORT_BASE + offset
    print(f"config.toml をslot{slot}用に書き換えました（ポートオフセット+{offset}）")
    print(f"  API: {54321 + offset}  DB: {54322 + offset}  Studio: {54323 + offset}")
    print(f"  アプリ（Next.js/Playwright）は PORT={app_port} を使うこと")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    patch(sys.argv[1], int(sys.argv[2]))
