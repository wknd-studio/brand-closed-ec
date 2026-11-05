import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

// メインのチェックアウトの開発サーバーはスロット1のポート3000に固定する（3000が使用中なら
// Next.jsが次の空きポートへ移り、スロット2以降のポートに入り込んでしまうため）。
// また、ワークツリーのE2Eが別スロットの開発サーバー（別のDBにつながっている）を
// 使い回さないことを、設定値で確かめる。

type Taskfile = {
  tasks: Record<string, { cmds: (string | { cmd: string })[] }>;
};

function commandsOf(task: string): string[] {
  const taskfile = parse(readFileSync("Taskfile.yml", "utf8")) as Taskfile;
  return taskfile.tasks[task].cmds.map((c) =>
    typeof c === "string" ? c : c.cmd
  );
}

describe("メインのチェックアウトの開発サーバーのポート", () => {
  it("package.json の dev は next dev にポート3000を明示する", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toMatch(/\bnext dev\b.*--port 3000\b/);
  });

  it("Taskfile.yml の dev:next は next dev にポート3000を明示する", () => {
    const nextDev = commandsOf("dev:next").filter((c) =>
      /\bnext dev\b/.test(c)
    );
    expect(nextDev).toHaveLength(1);
    expect(nextDev[0]).toMatch(/--port 3000\b/);
  });
});

type WebServer = { command: string; url: string; reuseExistingServer: boolean };

async function webServerWith(
  env: Record<string, string | undefined>
): Promise<WebServer> {
  // ローカルサーバーを起動しない条件（BASE_URLあり）にならないよう、BASE_URLは空にする
  vi.stubEnv("BASE_URL", "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const config = (await import("../../playwright.config")).default;
  return config.webServer as WebServer;
}

describe("playwright.config.ts の開発サーバーの使い回し", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("メインのチェックアウト（スロット1・ポート3000）では、動いている開発サーバーを使い回す", async () => {
    const webServer = await webServerWith({
      CI: "",
      WORKTREE_SLOT: "1",
      PORT: "3000",
    });
    expect(webServer.url).toBe("http://localhost:3000");
    expect(webServer.reuseExistingServer).toBe(true);
  });

  it("with-worktree-db.sh を通さないメインのチェックアウトでも使い回す", async () => {
    const webServer = await webServerWith({
      CI: "",
      WORKTREE_SLOT: undefined,
      PORT: undefined,
    });
    expect(webServer.url).toBe("http://localhost:3000");
    expect(webServer.reuseExistingServer).toBe(true);
  });

  it.each(["2", "5", "9"])(
    "ワークツリー（スロット%s）では、そのポートで動いているサーバーを使い回さない",
    async (slot) => {
      const webServer = await webServerWith({
        CI: "",
        WORKTREE_SLOT: slot,
        PORT: String(3000 + Number(slot) - 1),
      });
      expect(webServer.reuseExistingServer).toBe(false);
    }
  );

  it("CIでは使い回さない", async () => {
    const webServer = await webServerWith({
      CI: "true",
      WORKTREE_SLOT: undefined,
    });
    expect(webServer.reuseExistingServer).toBe(false);
  });
});
