import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import WithdrawalDialog from "./withdrawal-dialog";
import AddressList from "./address-list";

export default async function SettingsPage() {
  const { userId } = await auth();
  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);
  const addressRepo = new SupabaseAddressRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const addresses = user ? await addressRepo.findByUserId(user.id) : [];

  const addressDtos = addresses.map((a) => ({
    id: a.id,
    type: a.type,
    isDefault: a.isDefault,
    recipientLastName: a.recipientLastName,
    recipientFirstName: a.recipientFirstName,
    postalCode: a.postalCode,
    prefecture: a.prefecture,
    city: a.city,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    phoneNumber: a.phoneNumber,
  }));

  return (
    <main className="mx-auto max-w-xl space-y-10 px-6 py-12">
      <h1 className="text-xl font-semibold">アカウント設定</h1>

      <section className="space-y-6 rounded-lg border p-6">
        <h2 className="text-sm font-medium">住所管理</h2>
        <AddressList
          addresses={addressDtos}
          type="shipping"
          label="お届け先住所"
        />
        <hr />
        <AddressList
          addresses={addressDtos}
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
