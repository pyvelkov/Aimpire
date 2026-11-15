import { ProductTable } from "@/components/product-table";
import { cn } from "@/lib/utils";
import { reviewsByDecision } from "@/lib/approval";
import { EmptyState, PageIntro, Unavailable, surfaceClass } from "@/components/command/chrome";
import { loadApprovals } from "@/lib/load-approvals";
import { loadProductList } from "@/lib/load-product";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [result, reviews] = await Promise.all([loadProductList(), loadApprovals()]);
  const reviewIndex = reviews.ok ? reviewsByDecision(reviews.approvals) : {};

  return (
    <div className="space-y-5">
      <PageIntro title="Products">
        Product candidates, supplier evidence, and saved decisions. This section is read-only. Supplier cost, retail price, and margin are on each product.
      </PageIntro>
      {result.ok ? (
        result.products.length === 0 ? (
          <EmptyState>No product candidates yet.</EmptyState>
        ) : (
          <section className={cn(surfaceClass, "p-4 sm:p-5")}>
            <ProductTable products={result.products} reviewsByDecision={reviewIndex} />
          </section>
        )
      ) : (
        <Unavailable title="Products are unavailable" message={result.message} />
      )}
    </div>
  );
}
