// #497 の動作確認用。わざと失敗させてSupabaseのログのアーティファクトを確かめる。PRのマージ前にrevertする
import { test, expect } from "@playwright/test";

test("#497 わざと失敗させる", async () => {
  expect("intentional failure for #497").toBe("");
});
