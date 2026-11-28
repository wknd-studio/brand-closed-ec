import {
  reviewReturn,
  type ReviewReturnDeps,
  type ReviewReturnInput,
} from "./review-return";

/** 運営者が返品申請を却下する（requested → rejected。docs/domain/returns.md） */
export function rejectReturn(
  input: ReviewReturnInput,
  deps: ReviewReturnDeps
): Promise<void> {
  return reviewReturn(input, deps, (returnRequest) => returnRequest.reject());
}
