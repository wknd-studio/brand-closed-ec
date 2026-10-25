import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseRecipients } from "../../scripts/ci/encrypt-artifact";

const SCRIPT = path.resolve(__dirname, "../../scripts/ci/encrypt-artifact.ts");

// テスト用に作って秘密鍵を捨てたageの公開鍵（この鍵で暗号化したものは誰にも復号できない）
const RECIPIENT_A =
  "age127ntmsa69zlmwspf6xgpctzwvtrn2hypvx603vk3wlt9m4sn59xsfz43c6";
const RECIPIENT_B =
  "age15se39c5g8nykvympauejz5w96y6r3vudfhh0mrcvnnl4s2p7cq8s5n688h";

describe("parseRecipients", () => {
  it("コメント・空行を除いて、公開鍵を順に返す", () => {
    expect(
      parseRecipients(
        `# CIのログの暗号化に使う公開鍵\n\n${RECIPIENT_A}\n  ${RECIPIENT_B}  # 予備\n`
      )
    ).toEqual([RECIPIENT_A, RECIPIENT_B]);
  });

  it("公開鍵が1つも無ければ失敗する", () => {
    expect(() => parseRecipients("")).toThrow("公開鍵");
    expect(() => parseRecipients("# コメントだけ\n\n")).toThrow("公開鍵");
  });

  it("age1で始まる公開鍵の形でない行があれば、行番号を出して失敗する", () => {
    expect(() => parseRecipients(`${RECIPIENT_A}\nssh-ed25519 AAAA`)).toThrow(
      "2行目"
    );
    // 1文字欠けている
    expect(() => parseRecipients(RECIPIENT_A.slice(0, -1))).toThrow("1行目");
    // 秘密鍵を誤って置いた
    expect(() =>
      parseRecipients(
        "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ"
      )
    ).toThrow("1行目");
  });

  it("不正な行の中身はエラーメッセージに出さない（秘密鍵を誤って置いた場合に備える）", () => {
    const secretLike =
      "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ";
    expect(() => parseRecipients(secretLike)).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(secretLike),
      })
    );
  });
});

describe("scripts/ci/log-recipients.txt（コミットされた公開鍵のファイル）", () => {
  const file = path.resolve(__dirname, "../../scripts/ci/log-recipients.txt");

  it("ageの公開鍵だけが書かれている（秘密鍵を誤ってコミットしていない）", () => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain("AGE-SECRET-KEY-");
    expect(parseRecipients(text).length).toBeGreaterThan(0);
  });
});

describe("encrypt-artifact.ts（偽のageで実行）", () => {
  // ファイルの中身がActionsのログに出ないことを確かめるための目印
  const MARKER = "report-content-marker-3b9e";
  let work: string;
  let cwd: string;
  let outDir: string;
  let outFile: string;
  let binDir: string;
  let tmpDir: string;
  let recipientsFile: string;

  beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), "encrypt-artifact-test-"));
    cwd = path.join(work, "repo");
    outDir = path.join(cwd, "encrypted");
    outFile = path.join(outDir, "playwright-report.tar.gz.age");
    binDir = path.join(work, "bin");
    tmpDir = path.join(work, "tmp");
    recipientsFile = path.join(work, "log-recipients.txt");
    mkdirSync(binDir);
    mkdirSync(tmpDir);
    mkdirSync(path.join(cwd, "playwright-report", "data"), { recursive: true });
    mkdirSync(path.join(cwd, "test-results", "checkout-chromium"), {
      recursive: true,
    });
    writeFileSync(
      path.join(cwd, "playwright-report", "index.html"),
      `<html>${MARKER}</html>`
    );
    writeFileSync(
      path.join(cwd, "playwright-report", "data", "trace.zip"),
      `trace ${MARKER}`
    );
    writeFileSync(
      path.join(cwd, "test-results", "checkout-chromium", "video.webm"),
      `video ${MARKER}`
    );
    writeFileSync(recipientsFile, `${RECIPIENT_A}\n${RECIPIENT_B}\n`);

    // age -e -r <鍵> ... -o <出力> <入力> を模す。出力は「FAKE-AGE <鍵...>」の1行＋入力そのもの。
    // FAIL_AGE があれば途中まで書いてから失敗する
    writeFileSync(
      path.join(binDir, "age"),
      `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "v1.1.1"; exit 0; fi
recipients=(); out=""; input=""
while [ $# -gt 0 ]; do
  case "$1" in
    -e) shift ;;
    -r) recipients+=("$2"); shift 2 ;;
    -o) out="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
if [ -n "$FAIL_AGE" ]; then echo "partial" > "$out"; exit 1; fi
{ echo "FAKE-AGE \${recipients[*]}"; cat "$input"; } > "$out"
`
    );
    chmodSync(path.join(binDir, "age"), 0o755);
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function run(
    options: {
      env?: Record<string, string>;
      recipients?: string;
      out?: string;
      inputs?: string[];
      path?: string;
    } = {}
  ) {
    return spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        SCRIPT,
        options.out ?? outFile,
        ...(options.inputs ?? ["playwright-report", "test-results"]),
        "--recipients",
        options.recipients ?? recipientsFile,
      ],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          TMPDIR: tmpDir,
          ...options.env,
          PATH: options.path ?? `${binDir}:${process.env.PATH}`,
        },
      }
    );
  }

  // スクリプトが作る一時ディレクトリ（tsxのキャッシュ等は除く）
  function leftoverTempDirs() {
    return readdirSync(tmpDir).filter((name) =>
      name.startsWith("encrypt-artifact-")
    );
  }

  // 偽のageが書いた出力から、暗号化に渡されたtar.gzを取り出して展開する
  function extractArchive(): { recipients: string; dir: string } {
    const content = readFileSync(outFile);
    const newline = content.indexOf(0x0a);
    const header = content.subarray(0, newline).toString();
    const archive = path.join(work, "archive.tar.gz");
    writeFileSync(archive, content.subarray(newline + 1));
    const dir = path.join(work, "extracted");
    mkdirSync(dir);
    execFileSync("tar", ["-xzf", archive, "-C", dir]);
    return { recipients: header.replace(/^FAKE-AGE /, ""), dir };
  }

  it("指定したディレクトリを1つのtar.gzにまとめ、公開鍵ファイルの全ての鍵で暗号化したファイルだけを出力先に置く", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);

    expect(readdirSync(outDir)).toEqual(["playwright-report.tar.gz.age"]);
    const { recipients, dir } = extractArchive();
    expect(recipients).toBe(`${RECIPIENT_A} ${RECIPIENT_B}`);
    expect(readdirSync(dir).sort()).toEqual([
      "playwright-report",
      "test-results",
    ]);
    expect(
      readFileSync(
        path.join(dir, "playwright-report", "data", "trace.zip"),
        "utf8"
      )
    ).toBe(`trace ${MARKER}`);
    expect(
      readFileSync(
        path.join(dir, "test-results", "checkout-chromium", "video.webm"),
        "utf8"
      )
    ).toBe(`video ${MARKER}`);
  });

  it("Actionsのログには、まとめたパス・件数・サイズだけを出し、ファイルの中身は出さない", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(MARKER);
    expect(output).toMatch(/playwright-report（2個のファイル、\d+ bytes）/);
    expect(output).toMatch(/test-results（1個のファイル、\d+ bytes）/);
    expect(output).toMatch(/playwright-report\.tar\.gz\.age（\d+ bytes）/);
  });

  it("無いパスは飛ばして、あるパスだけを暗号化する（テストの失敗の仕方によっては片方しか無いため）", () => {
    rmSync(path.join(cwd, "test-results"), { recursive: true });
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("test-results（無いため飛ばしました）");
    expect(readdirSync(extractArchive().dir)).toEqual(["playwright-report"]);
  });

  it("暗号化前のファイルを一時ディレクトリに残さない", () => {
    expect(run().status).toBe(0);
    expect(leftoverTempDirs()).toEqual([]);
  });

  describe("fail closed（何も出力しない）", () => {
    function expectNothingWritten(result: ReturnType<typeof run>) {
      expect(result.status).not.toBe(0);
      expect(existsSync(outDir)).toBe(false);
      expect(leftoverTempDirs()).toEqual([]);
      expect(result.stdout + result.stderr).not.toContain(MARKER);
    }

    it("公開鍵のファイルが無ければ失敗する", () => {
      expectNothingWritten(run({ recipients: path.join(work, "missing.txt") }));
    });

    it("公開鍵のファイルが空なら失敗する", () => {
      writeFileSync(recipientsFile, "# まだ鍵が無い\n");
      expectNothingWritten(run());
    });

    it("公開鍵のファイルに不正な行があれば失敗する", () => {
      writeFileSync(recipientsFile, `${RECIPIENT_A}\nnot-a-key\n`);
      expectNothingWritten(run());
    });

    it("ageが無ければ失敗する", () => {
      // 手元に本物のageが入っていても見つからないよう、PATHをbashとtarだけにする
      const onlyBin = path.join(work, "only-bin");
      mkdirSync(onlyBin);
      for (const command of ["bash", "tar", "gzip"]) {
        symlinkSync(
          execFileSync("bash", ["-c", `command -v ${command}`], {
            encoding: "utf8",
          }).trim(),
          path.join(onlyBin, command)
        );
      }
      expectNothingWritten(run({ path: onlyBin }));
    });

    it("暗号化に失敗したら、途中まで書かれたファイルも含めて何も出力しない", () => {
      expectNothingWritten(run({ env: { FAIL_AGE: "1" } }));
    });

    it("出力先のファイル名が .age で終わらなければ失敗する（暗号化前のファイルと取り違えないため）", () => {
      expectNothingWritten(
        run({ out: path.join(outDir, "playwright-report.tar.gz") })
      );
    });

    it("暗号化するパスが1つも指定されていなければ失敗する", () => {
      expectNothingWritten(run({ inputs: [] }));
    });

    it("指定したパスが1つも無ければ失敗する（空のアーティファクトを置かない）", () => {
      rmSync(path.join(cwd, "playwright-report"), { recursive: true });
      rmSync(path.join(cwd, "test-results"), { recursive: true });
      expectNothingWritten(run());
    });

    it("作業ディレクトリの外のパスは指定できない", () => {
      expectNothingWritten(run({ inputs: ["playwright-report", "../bin"] }));
    });

    it("出力先が暗号化するパスの中にあれば失敗する（暗号化したファイルを自分自身に含めないため）", () => {
      expectNothingWritten(
        run({
          out: path.join(cwd, "test-results", "playwright-report.tar.gz.age"),
        })
      );
      expect(
        existsSync(
          path.join(cwd, "test-results", "playwright-report.tar.gz.age")
        )
      ).toBe(false);
    });
  });
});
