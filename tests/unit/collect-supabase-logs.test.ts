import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MIN_SECRET_LENGTH,
  redactSecrets,
  selectSupabaseContainers,
} from "../../scripts/ci/collect-supabase-logs";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/collect-supabase-logs.ts"
);

describe("redactSecrets", () => {
  it("シークレットの値をキー名入りの印に置き換え、キーごとの件数を返す", () => {
    const secrets = {
      STRIPE_SECRET_KEY: "sk_test_abcdefghijkl",
      CLERK_SECRET_KEY: "sk_clerk_zyxwvuts",
    };
    const { text, counts } = redactSecrets(
      "a sk_test_abcdefghijkl b sk_test_abcdefghijkl c sk_clerk_zyxwvuts",
      secrets
    );
    expect(text).toBe(
      "a [REDACTED:STRIPE_SECRET_KEY] b [REDACTED:STRIPE_SECRET_KEY] c [REDACTED:CLERK_SECRET_KEY]"
    );
    expect(counts).toEqual({ STRIPE_SECRET_KEY: 2, CLERK_SECRET_KEY: 1 });
  });

  it("含まれていなければ本文を変えず、件数は空", () => {
    const { text, counts } = redactSecrets("nothing here", {
      KEY: "secret-value-123",
    });
    expect(text).toBe("nothing here");
    expect(counts).toEqual({});
  });

  it(`${MIN_SECRET_LENGTH}文字未満の値（true・ポート番号等）は置き換えない`, () => {
    const short = "x".repeat(MIN_SECRET_LENGTH - 1);
    const { text, counts } = redactSecrets(`flag=true port=3000 ${short}`, {
      DISABLE_EMAIL_SENDING: "true",
      PORT: "3000",
      SHORT: short,
    });
    expect(text).toBe(`flag=true port=3000 ${short}`);
    expect(counts).toEqual({});
  });

  it("正規表現の特殊文字を含む値もそのまま一致させる", () => {
    const { text } = redactSecrets("p=a+b*c(d)$e.f end", {
      PASSWORD: "a+b*c(d)$e.f",
    });
    expect(text).toBe("p=[REDACTED:PASSWORD] end");
  });

  it("ある値が別の値を含むときは、長い方を先に置き換える", () => {
    const { text, counts } = redactSecrets("token=abcdefgh-ijklmnop", {
      SHORT: "abcdefgh",
      LONG: "abcdefgh-ijklmnop",
    });
    expect(text).toBe("token=[REDACTED:LONG]");
    expect(counts).toEqual({ LONG: 1 });
  });

  it("文字列でない値は無視する", () => {
    const { text } = redactSecrets("x", {
      NUM: 12345678 as unknown as string,
    });
    expect(text).toBe("x");
  });
});

describe("selectSupabaseContainers", () => {
  it("supabase_ で始まるコンテナだけを返す", () => {
    expect(
      selectSupabaseContainers(
        "supabase_kong_x\nsupabase_rest_x\n\nother_container\nsupabase_db_x\n"
      )
    ).toEqual(["supabase_kong_x", "supabase_rest_x", "supabase_db_x"]);
  });
});

describe("collect-supabase-logs.ts（偽のdockerで実行）", () => {
  let work: string;
  let outDir: string;
  let binDir: string;

  beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), "collect-supabase-logs-"));
    outDir = path.join(work, "out");
    binDir = path.join(work, "bin");
    spawnSync("mkdir", ["-p", binDir]);
    // docker ps -a / docker ps -a --format / docker logs <name> を模す
    const fakeDocker = `#!/usr/bin/env bash
if [ "$1" = "ps" ] && [ "$3" = "--format" ]; then
  printf 'supabase_kong_p\\nsupabase_rest_p\\nunrelated\\n'
elif [ "$1" = "ps" ]; then
  echo "CONTAINER ID   NAMES  leaked=sk_live_supersecret"
elif [ "$1" = "logs" ]; then
  name="\${@: -1}"
  echo "stdout of $name key=sk_live_supersecret"
  echo "stderr of $name" >&2
else
  exit 2
fi
`;
    writeFileSync(path.join(binDir, "docker"), fakeDocker);
    chmodSync(path.join(binDir, "docker"), 0o755);
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function run(stdin: string) {
    return spawnSync("pnpm", ["-s", "tsx", SCRIPT, outDir], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
  }

  it("docker ps -a とSupabaseのコンテナごとのログを、シークレットを伏せて書き出す", () => {
    const result = run(JSON.stringify({ STRIPE_KEY: "sk_live_supersecret" }));
    expect(result.status, result.stderr).toBe(0);

    expect(readdirSync(outDir).sort()).toEqual([
      "docker-ps.txt",
      "supabase_kong_p.log",
      "supabase_rest_p.log",
    ]);
    const kong = readFileSync(path.join(outDir, "supabase_kong_p.log"), "utf8");
    expect(kong).toContain("stdout of supabase_kong_p");
    expect(kong).toContain("stderr of supabase_kong_p");
    expect(kong).toContain("[REDACTED:STRIPE_KEY]");

    for (const file of readdirSync(outDir)) {
      expect(readFileSync(path.join(outDir, file), "utf8")).not.toContain(
        "sk_live_supersecret"
      );
    }
    // 件数はキー名だけを出し、値は出さない
    expect(result.stdout).toContain("STRIPE_KEY: 3");
    expect(result.stdout).not.toContain("sk_live_supersecret");
  });

  it("標準入力がJSONとして読めなければ、何も書き出さずに失敗する", () => {
    const result = run("not json");
    expect(result.status).not.toBe(0);
    expect(() => readdirSync(outDir)).toThrow();
  });
});
