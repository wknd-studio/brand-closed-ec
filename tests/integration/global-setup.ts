import { assertRunViaWorktreeDb } from "../worktree-guard";

export default function setup() {
  assertRunViaWorktreeDb("test:integration");
}
