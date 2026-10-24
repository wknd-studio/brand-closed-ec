# with-worktree-db.sh / worktree-db-stop.sh 共通のスロット管理（source して使う）。
#
# スロットNの確保 = <git-common-dir>/worktree-slots/N ディレクトリの作成（mkdirは原子的なため、
# 複数のワークツリーで同時に確保が走っても同じスロットを二重に確保しない）。
# owner ファイルに確保したワークツリーの絶対パスを記録する。

# シェルの設定を読まない環境（GUIアプリから呼ばれた場合等）でもHomebrewのsupabase等を見つけられるようにする
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

SLOT_MIN=2
SLOT_MAX=9
PROJECT_ID_BASE="brand-closed-ec"
SLOTS_DIR="$(git rev-parse --path-format=absolute --git-common-dir)/worktree-slots"

# このワークツリーが確保済みのスロット番号を出力する（無ければ何も出力しない）
find_own_slot() {
  local worktree_dir="$1" n
  for n in $(seq "$SLOT_MIN" "$SLOT_MAX"); do
    if [ "$(cat "$SLOTS_DIR/$n/owner" 2>/dev/null)" = "$worktree_dir" ]; then
      echo "$n"
      return
    fi
  done
}

# Orca導入前の /work-on-issue スキルで作ったワークツリーは確保の記録を残さないため、
# そのスロットのSupabaseコンテナが存在するかでも使用中を判定する
slot_has_containers() {
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q -- "-slot$1\$"
}

# 空きスロットを確保して番号を出力する（確保済みならそれを再利用する）
claim_slot() {
  local worktree_dir="$1" n owner own
  own="$(find_own_slot "$worktree_dir")"
  if [ -n "$own" ]; then
    echo "$own"
    return
  fi

  mkdir -p "$SLOTS_DIR"
  for n in $(seq "$SLOT_MIN" "$SLOT_MAX"); do
    if [ -d "$SLOTS_DIR/$n" ]; then
      owner="$(cat "$SLOTS_DIR/$n/owner" 2>/dev/null || true)"
      # 持ち主のワークツリーが削除済み（worktree-db-stop.sh を実行せずに削除した等）の確保は、
      # 残ったSupabaseコンテナを片付けてから解放して再利用する
      if [ -n "$owner" ] && [ ! -d "$owner" ]; then
        if slot_has_containers "$n"; then
          echo "==> 削除済みワークツリー($owner)のスロット${n}に残ったSupabaseを片付けます" >&2
          supabase stop --project-id "${PROJECT_ID_BASE}-slot${n}" --no-backup >&2 || true
        fi
        rm -rf "${SLOTS_DIR:?}/$n"
      else
        continue
      fi
    fi
    slot_has_containers "$n" && continue
    if mkdir "$SLOTS_DIR/$n" 2>/dev/null; then
      echo "$worktree_dir" > "$SLOTS_DIR/$n/owner"
      echo "$n"
      return
    fi
  done

  echo "空きスロットがありません（${SLOT_MIN}〜${SLOT_MAX}がすべて使用中）。作業が終わったワークツリーで scripts/worktree-db-stop.sh を実行してください" >&2
  return 1
}

release_slot() {
  rm -rf "${SLOTS_DIR:?}/$1"
}

# スロット番号（1〜9）に対応する開発サーバー（Next.js/Playwright）のポートを出力する。
# 3000から1つずつずらす（3000〜3008）。1000刻みにするとスロット4が6000（ブラウザが接続を拒否するX11のポート）、
# スロット5が7000（macOSのAirPlayレシーバーが使うことがある）に当たるため
app_port_for_slot() {
  case "$1" in
    [1-9]) echo $((3000 + $1 - 1)) ;;
    *)
      echo "スロットは1〜9の範囲で指定してください: $1" >&2
      return 1
      ;;
  esac
}
