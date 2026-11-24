# Worker 用の Doppler の config（stg・prod）の値を、Worker に上げる（wrangler deploy --secrets-file に渡す）前に確かめる（#672）。
# - Doppler が付ける DOPPLER_PROJECT・DOPPLER_CONFIG・DOPPLER_ENVIRONMENT は Worker に要らないため落とす
# - 管理用のトークンは、それを引き継ぐデプロイ用の config（stg_deploy・prod_deploy）にだけ置く。
#   Worker 用の config に置き間違えていたら、Worker に上げずに失敗させる（名前だけを出し、値は出さない）
# 使い方: doppler secrets download ... --format json | jq -f scripts/ci/filter-worker-env.jq
[
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_URL",
  "CLOUDFLARE_API_TOKEN",
  "SENTRY_AUTH_TOKEN",
  "SANITY_AUTH_TOKEN",
  "SANITY_WRITE_TOKEN"
] as $admin
| ([keys[] | select(IN($admin[]))]) as $found
| if ($found | length) > 0 then
    error("Worker 用の config に管理用のトークンがある（デプロイ用の config に移す）: \($found | join(" "))")
  else
    with_entries(select(.key | startswith("DOPPLER_") | not))
  end
