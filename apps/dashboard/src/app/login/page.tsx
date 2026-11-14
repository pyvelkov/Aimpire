import { LoginForm } from "@/components/login-form";

const notices: Record<string, string> = {
  config: "Dashboard authentication is not configured.",
  owner: "This dashboard is limited to the Aimpire owner.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const notice = params.error ? notices[params.error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <p className="text-xs font-semibold tracking-[0.28em] text-pine">AIMPIRE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Command Center</h1>
      <p className="mt-2 text-sm text-muted">
        Owner access only. Public signup is disabled.
      </p>
      <LoginForm notice={notice} />
    </main>
  );
}
