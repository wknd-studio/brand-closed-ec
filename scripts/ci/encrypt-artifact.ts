import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * CIのアーティファクトに置くファイルを、ageの公開鍵で暗号化する共通の処理（#497・#513）。
 * このリポジトリはpublicで、アーティファクトは誰でもダウンロードできる。中身に何が含まれていても
 * 漏れないよう、値を探して伏せるのではなく暗号化する。秘密鍵はCIに置かず、復号は手元でだけ行う
 * （手順は docs/cicd.md「失敗時のアーティファクト（暗号化）」）。
 *   - 公開鍵のファイルが無い・空・不正、ageが無い、暗号化に失敗した、のどれでも何も書き出さずに失敗する
 *   - 暗号化前のtar.gzは出力先とは別の一時ディレクトリにだけ置き、終了時に消す
 *   - 標準出力にはパス・件数・サイズだけを出し、ファイルの中身は出さない
 *
 * 使い方: pnpm -s tsx scripts/ci/encrypt-artifact.ts <出力先.age> <パス>... [--recipients <公開鍵のファイル>]
 *   <パス> は作業ディレクトリからの相対パス。無いパスは飛ばす（1つも無ければ失敗する）
 *   公開鍵のファイルの既定は scripts/ci/log-recipients.txt（1行に1つ、`#` 以降はコメント）
 */

export const DEFAULT_RECIPIENTS_FILE = path.join(
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

/** 公開鍵を読み、ageが使えることまで確かめる。暗号化するものを用意する前に呼ぶ */
export function loadRecipients(recipientsFile: string): string[] {
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
  return recipients;
}

export function assertEncryptedName(out: string): void {
  if (!out.endsWith(".age")) {
    throw new Error(
      `出力先のファイル名は .age で終わる必要があります（暗号化前のファイルと取り違えないため）: ${out}`
    );
  }
}

/**
 * cwd からの相対パス entries を1つのtar.gzにまとめ、recipients の全ての鍵で暗号化して out に置く。
 * 途中で失敗しても out に書きかけのファイルが残らないよう、一時ディレクトリで暗号化してから移す
 */
export function encryptToFile(options: {
  cwd: string;
  entries: string[];
  out: string;
  recipients: string[];
}): void {
  const { cwd, entries, out, recipients } = options;
  assertEncryptedName(out);
  if (entries.length === 0) throw new Error("暗号化するパスがありません");
  const work = mkdtempSync(path.join(tmpdir(), "encrypt-artifact-"));
  try {
    const archive = path.join(work, "archive.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", cwd, "--", ...entries], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const encrypted = path.join(work, "encrypted.age");
    execFileSync(
      "age",
      ["-e", ...recipients.flatMap((r) => ["-r", r]), "-o", encrypted, archive],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    mkdirSync(path.dirname(out), { recursive: true });
    copyFileSync(encrypted, out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function summarize(target: string): { files: number; bytes: number } {
  const stat = statSync(target);
  if (!stat.isDirectory()) return { files: 1, bytes: stat.size };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(target, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    files += 1;
    bytes += statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return { files, bytes };
}

// シンボリックリンクを解決した絶対パス。まだ無いパスは、あるところまでの祖先を解決してつなぐ
function realResolve(target: string): string {
  const absolute = path.resolve(target);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(realResolve(parent), path.basename(absolute));
}

function parseArgs(argv: string[]): {
  out: string;
  inputs: string[];
  recipientsFile: string;
} {
  const index = argv.indexOf("--recipients");
  const recipientsFile =
    index === -1 ? DEFAULT_RECIPIENTS_FILE : argv[index + 1];
  const [out, ...inputs] = argv.filter(
    (_, i) => index === -1 || (i !== index && i !== index + 1)
  );
  if (!out || !recipientsFile || inputs.length === 0) {
    throw new Error(
      "使い方: pnpm -s tsx scripts/ci/encrypt-artifact.ts <出力先.age> <パス>... [--recipients <公開鍵のファイル>]"
    );
  }
  assertEncryptedName(out);
  return { out, inputs, recipientsFile };
}

function main() {
  const { out, inputs, recipientsFile } = parseArgs(process.argv.slice(2));
  const cwd = realResolve(process.cwd());
  const outPath = realResolve(out);

  const entries: string[] = [];
  const lines: string[] = [];
  for (const input of inputs) {
    const relative = path.relative(cwd, path.resolve(cwd, input));
    if (
      relative === "" ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`作業ディレクトリの中のパスだけを指定できます: ${input}`);
    }
    if (
      !path.relative(relative, path.relative(cwd, outPath)).startsWith("..")
    ) {
      throw new Error(
        `出力先が、暗号化するパスの中にあります: ${input}（暗号化したファイルを自分自身に含めないため）`
      );
    }
    if (!existsSync(path.join(cwd, relative))) {
      lines.push(`  ${relative}（無いため飛ばしました）`);
      continue;
    }
    entries.push(relative);
    const { files, bytes } = summarize(path.join(cwd, relative));
    lines.push(`  ${relative}（${files}個のファイル、${bytes} bytes）`);
  }

  // まとめる前に、暗号化できることを確かめる
  const recipients = loadRecipients(recipientsFile);
  if (entries.length === 0) {
    throw new Error(
      `暗号化するパスが1つもありません: ${inputs.join(" ")}（空のアーティファクトは置かない）`
    );
  }

  encryptToFile({ cwd, entries, out: outPath, recipients });

  console.log(`${recipients.length}個の公開鍵で暗号化しました:`);
  for (const line of lines) console.log(line);
  console.log(
    `出力: ${path.basename(outPath)}（${statSync(outPath).size} bytes）`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    // 想定内の失敗はメッセージだけを出す（例外のプロパティにファイルの中身が入っていることがあるため）
    console.error(error instanceof Error ? error.message : "失敗しました");
    process.exit(1);
  }
}
