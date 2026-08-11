import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";

// ticketの署名検証は行わない(kidが無くverifyTokenが使えず、専用の検証APIも
// 存在しない)。ここでの判定は「明らかに無効なticketを弾いてwaitlistへ誘導する」
// ためのUX目的の軽いチェックであり、実際のサインアップ可否はClerk側が
// 署名検証込みで最終判定するため、セキュリティ境界はここではない
function looksLikeValidTicket(ticket: string): boolean {
  try {
    const payloadBase64 = ticket.split(".")[1];
    const payload = JSON.parse(atob(payloadBase64));
    return (
      payload.st === "invitation" &&
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 招待ticket無しでの直接アクセスはClerkの「アクセス制限」画面を
  // 表示するだけで顧客にとって意味がないため、自前の/waitlistへ誘導する
  const { __clerk_ticket: ticket } = await searchParams;
  if (typeof ticket !== "string" || !looksLikeValidTicket(ticket)) {
    redirect("/waitlist");
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      {/* サインアップ画面の「アカウントをお持ちの方はサインイン」リンクは、
          遷移先の/sign-inにticketパラメータが引き継がれ、Clerk側がサインアップへ
          自動的に引き戻してしまう(既知の挙動)ため非表示にする */}
      <SignUp appearance={{ elements: { footerAction: "!hidden" } }} />
    </main>
  );
}
