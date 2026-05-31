import WithdrawalDialog from "./withdrawal-dialog";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-xl space-y-10 px-6 py-12">
      <h1 className="text-xl font-semibold">アカウント設定</h1>

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
