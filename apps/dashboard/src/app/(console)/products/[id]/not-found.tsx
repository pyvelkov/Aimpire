import Link from "next/link";

export default function ProductNotFound() {
  return (
    <section className="max-w-xl rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Product not found</h2>
      <p className="mt-2 text-sm text-zinc-400">
        That product is not in the saved candidate records.
      </p>
      <Link href="/products" className="mt-4 inline-block text-sm text-cyan-300 underline-offset-4 hover:underline">
        Back to products
      </Link>
    </section>
  );
}
