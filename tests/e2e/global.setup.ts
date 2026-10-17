import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { assertRunViaWorktreeDb } from "../worktree-guard";

setup("global setup", async () => {
  assertRunViaWorktreeDb("test:e2e");
  await clerkSetup();
});
