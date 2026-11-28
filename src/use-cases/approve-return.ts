import {
  reviewReturn,
  type ReviewReturnDeps,
  type ReviewReturnInput,
} from "./review-return";

/** 運営者が返品申請を承認する（requested → approved。docs/domain/returns.md） */
export function approveReturn(
  input: ReviewReturnInput,
  deps: ReviewReturnDeps
): Promise<void> {
  return reviewReturn(input, deps, (returnRequest, now) =>
    returnRequest.approve(now)
  );
}
