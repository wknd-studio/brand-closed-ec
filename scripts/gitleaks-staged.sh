#!/usr/bin/env bash
# commit する差分（ステージした変更）に機密情報が無いかを gitleaks で確かめる（#663）。
# .husky/pre-commit から呼ぶ。gitleaks が入っていなければ、黙って通さずに入れ方を出して失敗する。
# 誤検出は .gitleaks.toml の allowlist に理由付きで足す（入れ方・扱いは docs/cicd.md）
set -euo pipefail

if ! command -v gitleaks > /dev/null 2>&1; then
  cat >&2 << 'EOF'
gitleaks が入っていないため、commit を止めました（commit の前に機密情報の漏れを確かめるため）。
次のどちらかで入れてから、もう一度 commit してください（詳しくは docs/cicd.md の「機密情報の漏れの検査（gitleaks）」）。
  macOS:  brew install gitleaks
  その他: https://github.com/gitleaks/gitleaks#installing
EOF
  exit 1
fi

if ! gitleaks git --pre-commit --staged --redact --no-banner --verbose .; then
  cat >&2 << 'EOF'
gitleaks が、ステージした差分に機密情報らしい値を見つけたため、commit を止めました。
- 本物の鍵なら、ステージから外し、鍵を無効にして作り直す（一度 commit・push した鍵は漏れたものとして扱う）
- 誤検出（テスト用のダミーの値等）なら、.gitleaks.toml の allowlist に、理由のコメント付きで
  ファイルと値を絞って足す（ディレクトリ全体を外さない）
EOF
  exit 1
fi
