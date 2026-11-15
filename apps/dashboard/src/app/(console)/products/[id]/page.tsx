import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/product-detail";
import { reviewForDecision } from "@/lib/approval";
import { Unavailable } from "@/components/command/chrome";
import { loadApprovals } from "@/lib/load-approvals";
import { loadProductDetail } from "@/lib/load-product";
import { isProductId } from "@/lib/shipping-evidence";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isProductId(id)) {
    notFound();
  }

  const [result, reviews] = await Promise.all([loadProductDetail(id), loadApprovals()]);
  if (!result.ok) {
    if (result.notFound) {
      notFound();
    }
    return (
      <Unavailable title="Product details are unavailable" message={result.message} />
    );
  }

  const review = reviews.ok && result.product.decision
    ? reviewForDecision(reviews.approvals, result.product.decision.id)
    : null;

  return <ProductDetailView detail={result.product} review={review} />;
}
