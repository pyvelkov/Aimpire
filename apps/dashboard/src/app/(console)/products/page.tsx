import { ProductTable } from "@/components/product-table";
import { loadProductList } from "@/lib/load-product";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const result = await loadProductList();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Product candidates, supplier evidence, and saved decisions. This section is read-only.
        </p>
      </div>
      {result.ok ? (
        result.products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
            No product candidates yet.
          </p>
        ) : (
          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-line sm:p-5">
            <ProductTable products={result.products} />
          </section>
        )
      ) : (
        <section className="rounded-2xl bg-danger-soft p-5 text-danger ring-1 ring-danger/20">
          <h2 className="text-lg font-semibold">Products are unavailable</h2>
          <p className="mt-2 text-sm">{result.message}</p>
        </section>
      )}
    </div>
  );
}
