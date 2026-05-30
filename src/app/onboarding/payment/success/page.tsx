export default function PaymentSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">ありがとうございます</h1>
        <p className="text-sm text-gray-500">
          決済が完了しました。アカウントの設定を行っています。しばらくお待ちください。
        </p>
      </div>
    </main>
  );
}
