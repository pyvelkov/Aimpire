import { notFound } from "next/navigation";
import { ApprovalDetailView } from "@/components/approval-detail";
import { Unavailable } from "@/components/command/chrome";
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
      <Unavailable title="This review is unavailable" message={result.message} />
    );
  }
  return <ApprovalDetailView approval={result.approval} />;
}
