export function PasswordGate({
  passwordInput,
  onPasswordInputChange,
  onSubmit,
}: {
  passwordInput: string;
  onPasswordInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg"
      >
        <h1 className="text-lg font-semibold">Exa総合検索</h1>
        <p className="text-sm text-neutral-400">パスワードを入力してください</p>
        <input
          type="password"
          autoFocus
          value={passwordInput}
          onChange={(e) => onPasswordInputChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-base outline-none focus:border-neutral-500"
          placeholder="パスワード"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-neutral-100 px-4 py-3 text-base font-medium text-neutral-950 active:opacity-80"
        >
          開く
        </button>
      </form>
    </main>
  );
}
