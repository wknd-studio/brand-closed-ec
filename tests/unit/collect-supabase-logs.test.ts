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

import { selectSupabaseContainers } from "../../scripts/ci/collect-supabase-logs";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/collect-supabase-logs.ts"
);

// テスト用に作って秘密鍵を捨てたageの公開鍵（この鍵で暗号化したものは誰にも復号できない）
const RECIPIENT_A =
  "age127ntmsa69zlmwspf6xgpctzwvtrn2hypvx603vk3wlt9m4sn59xsfz43c6";
const RECIPIENT_B =
  "age15se39c5g8nykvympauejz5w96y6r3vudfhh0mrcvnnl4s2p7cq8s5n688h";

describe("selectSupabaseContainers", () => {
  it("supabase_ で始まるコンテナだけを返す", () => {
    expect(
      selectSupabaseContainers(
        "supabase_kong_x\nsupabase_rest_x\n\nother_container\nsupabase_db_x\n"
      )
    ).toEqual(["supabase_kong_x", "supabase_rest_x", "supabase_db_x"]);
  });
});

describe("collect-supabase-logs.ts（偽のdocker・偽のageで実行）", () => {
  // ログの中身がActionsのログに出ないことを確かめるための目印
  const MARKER = "log-content-marker-6f1c";
  let work: string;
  let outDir: string;
  let outFile: string;
  let binDir: string;
  let tmpDir: string;
  let recipientsFile: string;

  beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), "collect-supabase-logs-"));
    outDir = path.join(work, "out");
    outFile = path.join(outDir, "supabase-logs.tar.gz.age");
    binDir = path.join(work, "bin");
    tmpDir = path.join(work, "tmp");
    recipientsFile = path.join(work, "log-recipients.txt");
    mkdirSync(binDir);
    mkdirSync(tmpDir);
    writeFileSync(recipientsFile, `${RECIPIENT_A}\n${RECIPIENT_B}\n`);

    // docker ps -a / docker ps -a --format / docker logs <name> を模す。呼ばれたら印のファイルを作る
    writeFileSync(
      path.join(binDir, "docker"),
      `#!/usr/bin/env bash
: > "${work}/docker-called"
if [ "$1" = "ps" ] && [ "$3" = "--format" ]; then
  printf 'supabase_kong_p\\nsupabase_rest_p\\nunrelated\\n'
elif [ "$1" = "ps" ]; then
  echo "CONTAINER ID   NAMES ${MARKER}"
elif [ "$1" = "logs" ]; then
  name="\${@: -1}"
  if [ "$name" = "supabase_rest_p" ] && [ -n "$FAIL_REST_LOGS" ]; then
    echo "partial ${MARKER}"
    exit 1
  fi
  echo "stdout of $name ${MARKER}"
  echo "stderr of $name" >&2
else
  exit 2
fi
`
    );
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
    chmodSync(path.join(binDir, "docker"), 0o755);
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
        "--recipients",
        options.recipients ?? recipientsFile,
      ],
      {
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

  // スクリプトが作る一時ディレクトリ（tsxのキャッシュ等は除く）。暗号化は
  // scripts/ci/encrypt-artifact.ts の一時ディレクトリで行う
  function leftoverTempDirs() {
    return readdirSync(tmpDir).filter(
      (name) =>
        name.startsWith("supabase-logs-") ||
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

  it("ログをtar.gzにまとめ、公開鍵ファイルの全ての鍵で暗号化したファイルだけを出力先に置く", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);

    expect(readdirSync(outDir)).toEqual(["supabase-logs.tar.gz.age"]);
    const { recipients, dir } = extractArchive();
    expect(recipients).toBe(`${RECIPIENT_A} ${RECIPIENT_B}`);
    expect(readdirSync(path.join(dir, "supabase-logs")).sort()).toEqual([
      "docker-ps.txt",
      "supabase_kong_p.log",
      "supabase_rest_p.log",
    ]);
    const kong = readFileSync(
      path.join(dir, "supabase-logs", "supabase_kong_p.log"),
      "utf8"
    );
    expect(kong).toContain("stdout of supabase_kong_p");
    expect(kong).toContain("stderr of supabase_kong_p");
  });

  it("Actionsのログにはファイル名・件数・サイズだけを出し、ログの中身は出さない", () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain(MARKER);
    expect(output).toMatch(/supabase_kong_p\.log（\d+ bytes）/);
    expect(output).toContain("3個のファイル");
    expect(output).toMatch(/supabase-logs\.tar\.gz\.age（\d+ bytes）/);
  });

  it("暗号化前のファイルを一時ディレクトリに残さない", () => {
    expect(run().status).toBe(0);
    expect(leftoverTempDirs()).toEqual([]);
  });

  it("あるコンテナのdocker logsが失敗しても、中身を出さずに終了コードだけを残し、ほかのコンテナのログは集める", () => {
    const result = run({ env: { FAIL_REST_LOGS: "1" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(MARKER);

    const { dir } = extractArchive();
    expect(
      readFileSync(
        path.join(dir, "supabase-logs", "supabase_kong_p.log"),
        "utf8"
      )
    ).toContain("stdout of supabase_kong_p");
    expect(
      readFileSync(
        path.join(dir, "supabase-logs", "supabase_rest_p.log"),
        "utf8"
      )
    ).toBe(
      "docker logs --timestamps supabase_rest_p が失敗しました（終了コード: 1）\n"
    );
  });

  describe("fail closed（何も出力しない）", () => {
    function expectNothingWritten(result: ReturnType<typeof run>) {
      expect(result.status).not.toBe(0);
      expect(existsSync(outDir)).toBe(false);
      expect(leftoverTempDirs()).toEqual([]);
      expect(result.stdout + result.stderr).not.toContain(MARKER);
    }

    function expectDockerNotCalled() {
      expect(existsSync(path.join(work, "docker-called"))).toBe(false);
    }

    it("公開鍵のファイルが無ければ、ログを集めずに失敗する", () => {
      expectNothingWritten(run({ recipients: path.join(work, "missing.txt") }));
      expectDockerNotCalled();
    });

    it("公開鍵のファイルが空なら、ログを集めずに失敗する", () => {
      writeFileSync(recipientsFile, "# まだ鍵が無い\n");
      expectNothingWritten(run());
      expectDockerNotCalled();
    });

    it("公開鍵のファイルに不正な行があれば、ログを集めずに失敗する", () => {
      writeFileSync(recipientsFile, `${RECIPIENT_A}\nnot-a-key\n`);
      expectNothingWritten(run());
      expectDockerNotCalled();
    });

    it("ageが無ければ、ログを集めずに失敗する", () => {
      // 手元に本物のageが入っていても見つからないよう、PATHをbashと偽のdockerだけにする
      const onlyBin = path.join(work, "only-bin");
      mkdirSync(onlyBin);
      symlinkSync(
        execFileSync("bash", ["-c", "command -v bash"], {
          encoding: "utf8",
        }).trim(),
        path.join(onlyBin, "bash")
      );
      symlinkSync(path.join(binDir, "docker"), path.join(onlyBin, "docker"));
      expectNothingWritten(run({ path: onlyBin }));
      expectDockerNotCalled();
    });

    it("暗号化に失敗したら、途中まで書かれたファイルも含めて何も出力しない", () => {
      expectNothingWritten(run({ env: { FAIL_AGE: "1" } }));
    });

    it("出力先のファイル名が .age で終わらなければ失敗する（暗号化前のファイルと取り違えないため）", () => {
      expectNothingWritten(
        run({ out: path.join(outDir, "supabase-logs.tar.gz") })
      );
      expectDockerNotCalled();
    });
  });
});
