import { test, expect } from "@playwright/test";
import {
  signUpViaInvitation,
  cleanupTestUser,
  slotEmail,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = slotEmail("info+clerk_test_signup_rerender@wknd-studio.com");
const TEST_PASSWORD = "TestPassw0rd!12345";

test.describe("Clerkの登録フォームの描き直しでチェックが外れても登録を進められる", () => {
  test.afterEach(async () => {
    await cleanupTestUser(TEST_EMAIL);
  });

  test("利用規約のチェックボックスの最初のクリックが反映されなくても、チェックを入れ直して登録できる", async ({
    page,
  }) => {
    // stgでは、Clerkのフォームが登録（POST /v1/client/sign_ups）の応答で
    // 描き直され、直後のクリックでチェックが入らないことがあった（#520）。
    // 描き直しのタイミングはテストから作れないため、最初の1回のクリックを
    // 打ち消して「クリックしたがチェックが入らなかった」状態を再現する。
    // Clerkのフォームの構造が変わってクリックの対象がずれると、打ち消しが
    // 起きないままテストが通ってしまうため、打ち消した回数も最後に確かめる
    let swallowedClicks = 0;
    await page.exposeFunction("onLegalAcceptedClickSwallowed", () => {
      swallowedClicks += 1;
    });
    await page.addInitScript(() => {
      let swallowed = false;
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          if (
            !swallowed &&
            target instanceof HTMLInputElement &&
            target.id === "legalAccepted-field"
          ) {
            swallowed = true;
            event.preventDefault();
            void (
              window as unknown as {
                onLegalAcceptedClickSwallowed: () => Promise<void>;
              }
            ).onLegalAcceptedClickSwallowed();
          }
        },
        { capture: true }
      );
    });

    await signUpViaInvitation(page, TEST_EMAIL, TEST_PASSWORD);

    await expect(page).toHaveURL(/\/onboarding\/account-type/);
    expect(swallowedClicks).toBe(1);
  });
});
