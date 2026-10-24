import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/worktree-slot-lib.sh の app_port_for_slot（スロット番号 → 開発サーバーのポート）を
// 実際にbashで呼び出し、ブラウザが接続を拒否するポートやSupabaseのポートと重ならないことを確認する。

const ROOT = path.resolve(__dirname, "../..");
const LIB = path.join(ROOT, "scripts/worktree-slot-lib.sh");
const PATCH = path.join(ROOT, "scripts/patch-supabase-slot.py");
const CONFIG = path.join(ROOT, "supabase/config.toml");

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Chromiumの kRestrictedPorts（net/base/port_util.cc）。ここに含まれるポートへはブラウザが接続しない
const BROWSER_UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

// macOSのAirPlayレシーバー（コントロールセンター）が標準で待ち受けるポート
const MACOS_RESERVED_PORTS = new Set([5000, 7000]);

function appPortForSlot(slot: number | string) {
  return spawnSync(
    "bash",
    ["-c", `source "${LIB}" && app_port_for_slot "$1"`, "_", String(slot)],
    { cwd: ROOT, encoding: "utf8" }
  );
}

function portOf(slot: number): number {
  const result = appPortForSlot(slot);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toMatch(/^\d+$/);
  return Number(result.stdout.trim());
}

let tmp: string;
const supabasePortsBySlot = new Map<number, number[]>();

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "worktree-slot-port-"));
  for (const slot of SLOTS) {
    const config = path.join(tmp, `config-slot${slot}.toml`);
    copyFileSync(CONFIG, config);
    execFileSync("python3", [PATCH, config, String(slot)], { stdio: "ignore" });
    const ports = [
      ...readFileSync(config, "utf8").matchAll(/^\s*\w*port\s*=\s*(\d+)\s*$/gm),
    ].map((m) => Number(m[1]));
    supabasePortsBySlot.set(slot, ports);
  }
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("app_port_for_slot", () => {
  it("メインのチェックアウトのスロット1は3000のまま", () => {
    expect(portOf(1)).toBe(3000);
  });

  it.each(SLOTS)(
    "スロット%iのポートはブラウザのunsafe port・macOSの5000/7000に当たらない",
    (slot) => {
      const port = portOf(slot);
      expect(BROWSER_UNSAFE_PORTS.has(port)).toBe(false);
      expect(MACOS_RESERVED_PORTS.has(port)).toBe(false);
    }
  );

  it("スロット同士でポートが重ならない", () => {
    const ports = SLOTS.map(portOf);
    expect(new Set(ports).size).toBe(SLOTS.length);
  });

  it("どのスロットのポートも、全スロットのSupabaseのポートと重ならない", () => {
    expect(supabasePortsBySlot.get(1)).toContain(54321);
    const allSupabasePorts = new Set([...supabasePortsBySlot.values()].flat());
    for (const slot of SLOTS) {
      expect(allSupabasePorts.has(portOf(slot))).toBe(false);
    }
  });

  it.each(["0", "10", "abc", ""])(
    "範囲外・数字以外のスロット(%j)はエラーで止まる",
    (slot) => {
      const result = appPortForSlot(slot);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    }
  );
});
