# worktree-setup.sh / worktree-archive.sh 共通のスロット管理（source して使う）。
#
# スロットNの確保 = <git-common-dir>/worktree-slots/N ディレクトリの作成（mkdirは原子的なため、
# 複数のワークツリーで同時にsetupが走っても同じスロットを二重に確保しない）。
# owner ファイルに確保したワークツリーの絶対パスを記録する。

SLOT_MIN=2
SLOT_MAX=9
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
      # 持ち主のワークツリーが削除済み（archiveが走らなかった等）の確保は解放して再利用する
      if [ -n "$owner" ] && [ ! -d "$owner" ]; then
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

  echo "空きスロットがありません（${SLOT_MIN}〜${SLOT_MAX}がすべて使用中）。不要なワークツリーをOrcaで片付けてください" >&2
  return 1
}

release_slot() {
  rm -rf "${SLOTS_DIR:?}/$1"
}
