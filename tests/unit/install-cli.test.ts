import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const SCRIPT = path.resolve(
  __dirname,
  "../../.github/actions/install-cli/install-cli.sh"
);

// スクリプトをsourceして関数だけを呼ぶ（ネットワークには触れない）
function call(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {}
) {
  const result = spawnSync(
    "bash",
    ["-c", `source "$0" && ${script}`, SCRIPT, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, INSTALL_CLI_RETRY_DELAY: "0", ...env },
    }
  );
  return {
    status: result.status,
    stdout: result.stdout,
    output: result.stdout + result.stderr,
  };
}

describe("release_repo / release_tag / asset_name", () => {
  it("Supabase CLI は supabase/cli の v付きのタグから取る", () => {
    expect(call("release_repo supabase").stdout.trim()).toBe("supabase/cli");
    expect(call("release_tag supabase 2.116.0").stdout.trim()).toBe("v2.116.0");
    expect(call("asset_name supabase 2.116.0 linux amd64").stdout.trim()).toBe(
      "supabase_2.116.0_linux_amd64.tar.gz"
    );
  });

  it("Doppler CLI は DopplerHQ/cli の v無しのタグから取る", () => {
    expect(call("release_repo doppler").stdout.trim()).toBe("DopplerHQ/cli");
    expect(call("release_tag doppler 3.77.1").stdout.trim()).toBe("3.77.1");
    expect(call("asset_name doppler 3.77.1 linux amd64").stdout.trim()).toBe(
      "doppler_3.77.1_linux_amd64.tar.gz"
    );
  });

  it("知らないCLIは失敗する", () => {
    expect(call("release_repo stripe").status).not.toBe(0);
  });
});

describe("is_retryable", () => {
  it.each([
    ["5xx（504）", "0", "504"],
    ["5xx（500）", "0", "500"],
    ["タイムアウト（curl 28）", "28", "000"],
    ["接続失敗（curl 7）", "7", "000"],
    ["本体の受信中のタイムアウト（curl 28・200）", "28", "200"],
    ["本体の受信中の切断（curl 18・200）", "18", "200"],
  ])("%s はやり直す", (_label, curlExit, httpCode) => {
    expect(call(`is_retryable ${curlExit} ${httpCode}`).status).toBe(0);
  });

  it.each([
    ["403", "0", "403"],
    ["404", "0", "404"],
    ["429", "0", "429"],
  ])("4xx（%s）はやり直さない", (_label, curlExit, httpCode) => {
    expect(call(`is_retryable ${curlExit} ${httpCode}`).status).not.toBe(0);
  });
});

describe("fetch_with_retry", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "install-cli-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // curlを差し替え、応答の列（"<curlの終了コード>:<HTTPステータス>"）を順に返す。
  // 呼ばれたURLを calls に1行ずつ記録する
  function fetchWith(responses: string[]) {
    writeFileSync(path.join(dir, "responses"), responses.join("\n") + "\n");
    const fakeCurl = `
      curl() {
        local out="" url="" prev=""
        for a in "$@"; do
          [[ "$prev" == "-o" ]] && out="$a"
          [[ "$a" == https://* ]] && url="$a"
          prev="$a"
        done
        echo "$url" >> "$DIR/calls"
        local line; line="$(head -n1 "$DIR/responses")"
        sed -i.bak 1d "$DIR/responses"
        local rc="\${line%%:*}" code="\${line##*:}"
        [[ -n "$out" ]] && echo "body-$code" > "$out"
        printf '%s' "$code"
        return "$rc"
      }`;
    const result = call(
      `${fakeCurl}; fetch_with_retry https://api.github.com/x "$DIR/out" application/octet-stream`,
      [],
      { DIR: dir, INSTALL_CLI_MAX_ATTEMPTS: "3" }
    );
    const calls = readFileSync(path.join(dir, "calls"), "utf8")
      .trim()
      .split("\n");
    return { ...result, calls };
  }

  it("200ならそのまま成功する", () => {
    const { status, calls } = fetchWith(["0:200"]);
    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(readFileSync(path.join(dir, "out"), "utf8")).toContain("body-200");
  });

  it("5xx・タイムアウトのあとに成功すれば、やり直して成功する", () => {
    const { status, calls } = fetchWith(["0:504", "28:000", "0:200"]);
    expect(status).toBe(0);
    expect(calls).toHaveLength(3);
  });

  it("200を受け取ったあとの受信中にタイムアウトしても、やり直して成功する", () => {
    const { status, calls } = fetchWith(["28:200", "0:200"]);
    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("5xxが続けば上限回数で諦めて失敗する", () => {
    const { status, calls, output } = fetchWith(["0:504", "0:504", "0:504"]);
    expect(status).not.toBe(0);
    expect(calls).toHaveLength(3);
    expect(output).toContain("504");
  });

  it.each(["403", "404", "429"])("%s はやり直さずに失敗する", (code) => {
    const { status, calls, output } = fetchWith([`0:${code}`, "0:200"]);
    expect(status).not.toBe(0);
    expect(calls).toHaveLength(1);
    expect(output).toContain(code);
  });

  it("github.com/.../releases/download/ を通らない（API の URL だけを受け付ける）", () => {
    const result = call(
      'fetch_with_retry https://github.com/supabase/cli/releases/download/v2.116.0/x "$DIR/out" application/octet-stream',
      [],
      { DIR: dir }
    );
    expect(result.status).not.toBe(0);
  });
});

describe("verify_checksum", () => {
  let dir: string;
  const name = "supabase_2.116.0_linux_amd64.tar.gz";

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "install-cli-"));
    writeFileSync(path.join(dir, name), "binary");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function verify(checksums: string) {
    writeFileSync(path.join(dir, "checksums.txt"), checksums);
    return call('verify_checksum "$1" "$2" "$3"', [
      path.join(dir, name),
      name,
      path.join(dir, "checksums.txt"),
    ]);
  }

  const sha = createHash("sha256").update("binary").digest("hex");
  const other = createHash("sha256").update("other").digest("hex");

  it("checksums.txt の値と一致すれば成功する", () => {
    expect(
      verify(
        `${other}  supabase_linux_amd64.tar.gz\n${sha}  ${name}\n${other}  x.deb\n`
      ).status
    ).toBe(0);
  });

  it("一致しなければ（改ざん・取り違え）失敗する", () => {
    const { status, output } = verify(`${other}  ${name}\n`);
    expect(status).not.toBe(0);
    expect(output).toContain(name);
  });

  it("checksums.txt にファイルの行が無ければ失敗する（名前の前方一致で別のファイルの値を使わない）", () => {
    expect(verify(`${sha}  supabase_linux_amd64.tar.gz\n`).status).not.toBe(0);
    expect(verify(`${sha}  ${name}.sig\n`).status).not.toBe(0);
  });
});

describe("extract_cli", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "install-cli-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // files の各パスを、中身が実行できるシェルスクリプトのファイルとして tarball に詰める
  function tarball(files: Record<string, string>, prefix = "") {
    const src = path.join(dir, "src");
    for (const [name, body] of Object.entries(files)) {
      const file = path.join(src, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    }
    const out = path.join(dir, "cli.tar.gz");
    spawnSync("tar", [
      "-czf",
      out,
      "-C",
      src,
      ...Object.keys(files).map((f) => prefix + f),
    ]);
    return out;
  }

  function extract(file: string, tool: string) {
    const dest = path.join(dir, "dest");
    const result = call('extract_cli "$1" "$2" "$3"', [file, dest, tool]);
    return { ...result, dest };
  }

  it("Supabase CLI（v2.102.0 以降）は、シムの supabase と本体の supabase-go を同じディレクトリに置く", () => {
    const file = tarball({
      // 実物のシムと同じく、隣の supabase-go に処理を渡す
      supabase: 'exec "$(dirname "$0")/supabase-go" "$@"',
      "supabase-go": 'echo "2.102.0"',
    });
    const { status, dest } = extract(file, "supabase");
    expect(status).toBe(0);
    expect(readdirSync(dest).sort()).toEqual(["supabase", "supabase-go"]);
    const version = spawnSync(path.join(dest, "supabase"), ["--version"], {
      encoding: "utf8",
    });
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe("2.102.0");
  });

  it("entry が ./ 付きで入っている tarball でも、supabase と supabase-go を置く", () => {
    const file = tarball(
      { supabase: 'echo "x"', "supabase-go": 'echo "x"', LICENSE: "" },
      "./"
    );
    const { status, dest } = extract(file, "supabase");
    expect(status).toBe(0);
    expect(readdirSync(dest).sort()).toEqual(["supabase", "supabase-go"]);
  });

  it("supabase-go が無い tarball（それより前の版）は supabase だけを置く", () => {
    const { status, dest } = extract(
      tarball({ supabase: 'echo "2.0.0"' }),
      "supabase"
    );
    expect(status).toBe(0);
    expect(readdirSync(dest)).toEqual(["supabase"]);
  });

  it("Doppler CLI は doppler だけを置き、LICENSE・completions は展開しない", () => {
    const { status, dest } = extract(
      tarball({
        doppler: 'echo "3.77.1"',
        LICENSE: "",
        "README.md": "",
        "completions/doppler.bash": "",
      }),
      "doppler"
    );
    expect(status).toBe(0);
    expect(readdirSync(dest)).toEqual(["doppler"]);
  });

  it("tarball に CLI の実行ファイルが無ければ失敗する", () => {
    const { status } = extract(tarball({ LICENSE: "" }), "supabase");
    expect(status).not.toBe(0);
  });
});

describe("used_versions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "install-cli-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function usedVersions(workflows: Record<string, string>) {
    const files = Object.entries(workflows).map(([name, body]) => {
      const file = path.join(dir, name);
      writeFileSync(file, body);
      return file;
    });
    return call('used_versions "$@"', files);
  }

  it("ワークフローで install-cli に渡している CLI と版を、重複なく1行ずつ返す（デプロイのジョブでしか使わない版も含む）", () => {
    const { status, stdout } = usedVersions({
      "deploy.yml": `
      - uses: ./.github/actions/install-cli
        with: { tool: supabase, version: 2.116.0 }
      - uses: ./.github/actions/install-cli
        with: { tool: doppler, version: 3.77.1 }
  deploy-staging:
      - uses: ./.github/actions/install-cli
        with: { tool: supabase, version: 2.102.0 }
      - uses: ./.github/actions/install-cli
        with: { tool: doppler, version: 3.77.1 }
`,
      "sync.yml": `
      - uses: ./ci-tools/.github/actions/install-cli
        with: { tool: doppler, version: 3.77.1 }
`,
    });
    expect(status).toBe(0);
    expect(stdout.trim().split("\n")).toEqual([
      "doppler 3.77.1",
      "supabase 2.102.0",
      "supabase 2.116.0",
    ]);
  });

  it("1つも見つからなければ失敗する（書き方が変わって検査が空振りしないように）", () => {
    expect(usedVersions({ "x.yml": "jobs: {}\n" }).status).not.toBe(0);
  });

  it("install-cli の使用箇所の with: が読めなければ失敗する（読めない版を検査から漏らさない）", () => {
    const { status, output } = usedVersions({
      "deploy.yml": `
      - uses: ./.github/actions/install-cli
        with: { tool: supabase, version: 2.116.0 }
      - uses: ./.github/actions/install-cli
        with:
          tool: supabase
          version: 2.102.0
`,
    });
    expect(status).not.toBe(0);
    expect(output).toContain("deploy.yml");
  });

  it("クォート・行末のコメント・@ref 付きの uses: も install-cli の使用箇所として読む", () => {
    const { status, stdout } = usedVersions({
      "deploy.yml": `
      - uses: "./.github/actions/install-cli" # コメント
        with: { tool: supabase, version: 2.102.0 }
      - uses: wknd-studio/brand-closed-ec/.github/actions/install-cli@develop
        with: { tool: doppler, version: 3.77.1 }
`,
    });
    expect(status).toBe(0);
    expect(stdout.trim().split("\n")).toEqual([
      "doppler 3.77.1",
      "supabase 2.102.0",
    ]);
  });

  it("このリポジトリのワークフローの install-cli の使用箇所を、すべて読み取れる", () => {
    const workflows = readdirSync(".github/workflows").map((f) =>
      path.join(".github/workflows", f)
    );
    const { status, stdout } = call('used_versions "$@"', workflows);
    expect(status).toBe(0);
    expect(stdout.trim()).not.toBe("");
  });
});
