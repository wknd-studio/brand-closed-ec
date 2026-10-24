import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * CIのジョブ内で起動したローカルSupabaseのコンテナ（Kong・PostgREST・Postgres等）のログを、
 * テストが失敗したときにアーティファクトとして残すために書き出す（#497）。
 * 統合テストがときどきKongの502（"An invalid response was received from the upstream server"）で
 * 落ちる原因を、コンテナのログから追えるようにする。
 *
 * Doppler由来の値は、GitHubのsecretsに登録した値と違い、Actionsのログでもアーティファクトでも
 * 自動では伏せられない。そのため標準入力でDopplerのシークレット
 * （`doppler secrets download --no-file --format json`）を受け取り、値をすべて伏せてからファイルに書く
 * （伏せる前の内容はディスクにもActionsのログにも出さない）。
 * 伏せた件数はキー名だけを出力する。0件なら、コンテナのログにDoppler由来の値が出ていなかったことになる。
 *
 * 使い方: doppler secrets download --no-file --format json | pnpm -s tsx scripts/ci/collect-supabase-logs.ts <出力先>
 *   出力: <出力先>/docker-ps.txt（docker ps -a）と <出力先>/<コンテナ名>.log（docker logs --timestamps）
 */

/** これより短い値（"true"・ポート番号等）は伏せない。シークレットではなく、伏せると本文が読めなくなるため */
export const MIN_SECRET_LENGTH = 8;

export function redactSecrets(
  text: string,
  secrets: Record<string, unknown>
): { text: string; counts: Record<string, number> } {
  // Kong・GoTrue等はJSON形式でログを出し、URLのクエリにも値が載りうるため、
  // そのままの形に加えてJSONでエスケープした形・URLエンコードした形も伏せる
  const targets = Object.entries(secrets)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].length >= MIN_SECRET_LENGTH
    )
    .flatMap(([key, value]) =>
      [
        ...new Set([
          value,
          JSON.stringify(value).slice(1, -1),
          encodeURIComponent(value),
        ]),
      ].map((form) => ({ key, form }))
    )
    // ある値が別の値を含むとき、短い方を先に伏せると長い方が一部だけ残るため、長い順に伏せる
    .sort((a, b) => b.form.length - a.form.length);

  const counts: Record<string, number> = {};
  let result = text;
  for (const { key, form } of targets) {
    const parts = result.split(form);
    if (parts.length === 1) continue;
    counts[key] = (counts[key] ?? 0) + parts.length - 1;
    result = parts.join(`[REDACTED:${key}]`);
  }
  return { text: result, counts };
}

export function selectSupabaseContainers(names: string): string[] {
  return names
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.startsWith("supabase_"));
}

function docker(args: string[]): string {
  try {
    // docker logs はコンテナの標準エラー出力をこちらの標準エラー出力に流すため、両方を1つにまとめて読む
    return execFileSync("bash", ["-c", 'docker "$@" 2>&1', "docker", ...args], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    // 例外をそのまま投げると、Nodeが例外に入った伏せる前の出力を表示してしまう。
    // 終了コードだけを残し、ほかのコンテナのログは書き出しを続ける
    const status = (error as { status?: number | null }).status ?? "不明";
    const message = `docker ${args.join(" ")} が失敗しました（終了コード: ${status}）`;
    console.error(message);
    return `${message}\n`;
  }
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error(
      "使い方: doppler secrets download --no-file --format json | pnpm -s tsx scripts/ci/collect-supabase-logs.ts <出力先>"
    );
    process.exit(2);
  }

  // 伏せられない状態でログを書き出さないよう、シークレットを読めてから集め始める
  const secrets = JSON.parse(readFileSync(0, "utf8")) as Record<
    string,
    unknown
  >;

  const files: Record<string, string> = {
    "docker-ps.txt": docker(["ps", "-a"]),
  };
  const names = selectSupabaseContainers(
    docker(["ps", "-a", "--format", "{{.Names}}"])
  );
  for (const name of names) {
    files[`${name}.log`] = docker(["logs", "--timestamps", name]);
  }

  mkdirSync(outDir, { recursive: true });
  const total: Record<string, number> = {};
  for (const [file, content] of Object.entries(files)) {
    const { text, counts } = redactSecrets(content, secrets);
    writeFileSync(path.join(outDir, file), text);
    for (const [key, n] of Object.entries(counts)) {
      total[key] = (total[key] ?? 0) + n;
    }
  }

  console.log(`${names.length}個のコンテナのログを ${outDir} に書き出しました`);
  const redacted = Object.entries(total);
  if (redacted.length === 0) {
    console.log("Dopplerのシークレットの値はログに含まれていませんでした");
  } else {
    console.log("Dopplerのシークレットの値を伏せました（キー: 件数）:");
    for (const [key, n] of redacted) console.log(`  ${key}: ${n}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
