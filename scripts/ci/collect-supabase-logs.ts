import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * CIのジョブ内で起動したローカルSupabaseのコンテナ（Kong・PostgREST・Postgres等）のログを集め、
 * ageの公開鍵で暗号化したファイルだけを書き出す（#497）。統合テストがときどきKongの502
 * （"An invalid response was received from the upstream server"）で落ちる原因を、
 * コンテナのログから追えるようにする。
 *
 * このリポジトリはpublicで、アーティファクトは誰でもダウンロードできる。ログに何が含まれていても
 * 漏れないよう、値を探して伏せるのではなく暗号化する。秘密鍵はCIに置かず、復号は手元でだけ行う
 * （手順は docs/cicd.md「失敗時のSupabaseのログ」）。
 *   - 公開鍵のファイルが無い・空・不正、ageが無い、暗号化に失敗した、のどれでも何も書き出さずに失敗する
 *   - 暗号化前のログは出力先とは別の一時ディレクトリにだけ置き、終了時に消す
 *   - 標準出力にはファイル名・件数・サイズだけを出し、ログの中身は出さない
 *
 * 使い方: pnpm -s tsx scripts/ci/collect-supabase-logs.ts <出力先.age> [--recipients <公開鍵のファイル>]
 *   公開鍵のファイルの既定は scripts/ci/log-recipients.txt（1行に1つ、`#` 以降はコメント）
 */

const DEFAULT_RECIPIENTS_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "log-recipients.txt"
);

// ageのX25519の公開鍵（age1 + bech32の58文字）
const RECIPIENT_PATTERN = /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/;

export function parseRecipients(text: string): string[] {
  const recipients: string[] = [];
  text.split("\n").forEach((line, index) => {
    const value = line.replace(/#.*/, "").trim();
    if (value === "") return;
    if (!RECIPIENT_PATTERN.test(value)) {
      // 秘密鍵を誤って置いた場合に備え、行の中身はメッセージに出さない
      throw new Error(
        `公開鍵のファイルの${index + 1}行目が、ageの公開鍵（age1...）の形ではありません`
      );
    }
    recipients.push(value);
  });
  if (recipients.length === 0) {
    throw new Error("公開鍵のファイルに、ageの公開鍵が1つもありません");
  }
  return recipients;
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
    // 例外をそのまま投げると、Nodeが例外に入ったログの中身を表示してしまう。
    // 終了コードだけを残し、ほかのコンテナのログは集め続ける
    const status = (error as { status?: number | null }).status ?? "不明";
    const message = `docker ${args.join(" ")} が失敗しました（終了コード: ${status}）`;
    console.error(message);
    return `${message}\n`;
  }
}

function parseArgs(argv: string[]): { out: string; recipientsFile: string } {
  const index = argv.indexOf("--recipients");
  const recipientsFile =
    index === -1 ? DEFAULT_RECIPIENTS_FILE : argv[index + 1];
  const [out] = argv.filter(
    (_, i) => index === -1 || (i !== index && i !== index + 1)
  );
  if (!out || !recipientsFile) {
    throw new Error(
      "使い方: pnpm -s tsx scripts/ci/collect-supabase-logs.ts <出力先.age> [--recipients <公開鍵のファイル>]"
    );
  }
  if (!out.endsWith(".age")) {
    throw new Error(
      `出力先のファイル名は .age で終わる必要があります（暗号化前のファイルと取り違えないため）: ${out}`
    );
  }
  return { out, recipientsFile };
}

function main() {
  const { out, recipientsFile } = parseArgs(process.argv.slice(2));

  // ログを集める前に、暗号化できることを確かめる
  let recipientsText: string;
  try {
    recipientsText = readFileSync(recipientsFile, "utf8");
  } catch {
    throw new Error(`公開鍵のファイルを読めません: ${recipientsFile}`);
  }
  const recipients = parseRecipients(recipientsText);
  try {
    execFileSync("age", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("age コマンドが見つかりません");
  }

  const work = mkdtempSync(path.join(tmpdir(), "supabase-logs-"));
  try {
    const logsDir = path.join(work, "supabase-logs");
    mkdirSync(logsDir);
    const files: Record<string, string> = {
      "docker-ps.txt": docker(["ps", "-a"]),
    };
    for (const name of selectSupabaseContainers(
      docker(["ps", "-a", "--format", "{{.Names}}"])
    )) {
      files[`${name}.log`] = docker(["logs", "--timestamps", name]);
    }
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(path.join(logsDir, file), content);
    }

    const archive = path.join(work, "supabase-logs.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", work, "supabase-logs"]);
    // 途中で失敗しても出力先に書きかけのファイルが残らないよう、一時ディレクトリで暗号化してから移す
    const encrypted = path.join(work, "encrypted.age");
    execFileSync(
      "age",
      ["-e", ...recipients.flatMap((r) => ["-r", r]), "-o", encrypted, archive],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    mkdirSync(path.dirname(out), { recursive: true });
    copyFileSync(encrypted, out);

    console.log(
      `${Object.keys(files).length}個のファイルを、${recipients.length}個の公開鍵で暗号化しました:`
    );
    for (const file of Object.keys(files)) {
      console.log(
        `  ${file}（${statSync(path.join(logsDir, file)).size} bytes）`
      );
    }
    console.log(`出力: ${path.basename(out)}（${statSync(out).size} bytes）`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    // 想定内の失敗はメッセージだけを出す（例外のプロパティにログの中身が入っていることがあるため）
    console.error(error instanceof Error ? error.message : "失敗しました");
    process.exit(1);
  }
}
