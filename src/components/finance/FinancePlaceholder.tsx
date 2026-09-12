export function FinancePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-card border border-[color:var(--color-line)] bg-white px-6 py-16 text-center shadow-card">
      <h2 className="text-[20px] font-bold tracking-[-0.02em] text-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-[13.5px] leading-6 text-slate-500">
        {description}
      </p>
    </section>
  );
}
