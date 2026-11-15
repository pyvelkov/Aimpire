import { notFound } from "next/navigation";
import { ApprovalDetailView } from "@/components/approval-detail";
import { loadApproval } from "@/lib/load-approvals";
import { isProductId } from "@/lib/shipping-evidence";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isProductId(id)) {
    notFound();
  }
  const result = await loadApproval(id);
  if (!result.ok) {
    if (result.notFound) {
      notFound();
    }
    return (
      <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
        <h2 className="text-lg font-semibold">This review is unavailable</h2>
        <p className="mt-2 text-sm">{result.message}</p>
      </section>
    );
  }
  return <ApprovalDetailView approval={result.approval} />;
}
