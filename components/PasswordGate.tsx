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
    <main className="flex min-h-screen items-center justify-center bg-page px-6 text-fg">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6 shadow-lg"
      >
        <h1 className="text-lg font-semibold">Exa総合検索</h1>
        <p className="text-sm text-muted">パスワードを入力してください</p>
        <input
          type="password"
          autoFocus
          value={passwordInput}
          onChange={(e) => onPasswordInputChange(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-page px-4 py-3 text-base outline-none focus:border-neutral-500"
          placeholder="パスワード"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-fg px-4 py-3 text-base font-medium text-page active:opacity-80"
        >
          開く
        </button>
      </form>
    </main>
  );
}
