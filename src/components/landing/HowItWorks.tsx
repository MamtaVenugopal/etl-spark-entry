const steps = [
  { n: "01", title: "Describe", body: "Drop a free-text story — sources, targets, what should happen." },
  { n: "02", title: "Refine", body: "The agent rewrites it into a clean structured user story." },
  { n: "03", title: "Review", body: "Edit acceptance criteria, transformations, and priority." },
  { n: "04", title: "Ship to Jira", body: "We file it in project AEA with the right labels and ADF body." },
];

export function HowItWorks() {
  return (
    <section id="how" className="container mx-auto px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How it works</h2>
        <p className="mt-3 text-muted-foreground">
          Four steps from raw idea to a properly-formatted Jira ticket.
        </p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className="relative rounded-xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur hover:border-white/20 transition"
          >
            <div className="font-mono text-xs text-agent-cyan">{s.n}</div>
            <div className="mt-2 text-lg font-semibold">{s.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
