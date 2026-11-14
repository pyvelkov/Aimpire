import { redirect } from "next/navigation";
import { assertOwner } from "@/lib/auth";
import { ConsoleShell } from "@/components/console-shell";
import { DashboardAccessError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const owner = await assertOwner();
    return <ConsoleShell email={owner.email}>{children}</ConsoleShell>;
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      if (error.status === 403) {
        redirect("/login?error=owner");
      }

      if (error.status === 503) {
        redirect("/login?error=config");
      }

      redirect("/login");
    }

    throw error;
  }
}
