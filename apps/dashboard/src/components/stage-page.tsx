function StagePage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="max-w-2xl rounded-2xl bg-card p-6 shadow-sm ring-1 ring-line">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
    </section>
  );
}

export function WorldPage() {
  return (
    <StagePage
      title="AI World"
      body="The browser-based pixel-art office arrives in Stage 6.3. It is not part of this dashboard foundation."
    />
  );
}
