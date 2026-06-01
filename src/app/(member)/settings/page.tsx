import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import WithdrawalDialog from "./withdrawal-dialog";
import AddressList from "./address-list";

export default async function SettingsPage() {
  const { userId } = await auth();
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId!)
    .single();

  const { data: addresses } = user
    ? await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto max-w-xl space-y-10 px-6 py-12">
      <h1 className="text-xl font-semibold">アカウント設定</h1>

      <section className="space-y-6 rounded-lg border p-6">
        <h2 className="text-sm font-medium">住所管理</h2>
        <AddressList
          addresses={addresses ?? []}
          type="shipping"
          label="お届け先住所"
        />
        <hr />
        <AddressList
          addresses={addresses ?? []}
          type="billing"
          label="請求先住所"
        />
      </section>

      <section className="space-y-4 rounded-lg border border-red-200 p-6">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-red-700">退会</h2>
          <p className="text-sm text-gray-500">
            退会するとサービスへのアクセスができなくなります。有料プランの場合、サブスクリプションは即時解約されます。
          </p>
        </div>
        <WithdrawalDialog />
      </section>
    </main>
  );
}
