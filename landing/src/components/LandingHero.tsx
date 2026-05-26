const STEPS = [
  { n: "01", title: "Describe", desc: "Drop a free-text story — sources, targets, what should happen." },
  { n: "02", title: "Refine", desc: "The agent rewrites it into a clean structured user story." },
  { n: "03", title: "Review", desc: "Edit acceptance criteria, transformations, and priority." },
  { n: "04", title: "Ship to Agent", desc: "Starts the 4-agent pipeline and files Jira project AEA." },
];

export function LandingHero() {
  return (
    <section className="container mx-auto px-6 pt-16 pb-8 text-center">
      <p className="font-mono text-xs tracking-[0.3em] text-agent-cyan mb-4">
        AUTONOMOUS · ETL · AGENT
      </p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto">
        Describe your pipeline.{" "}
        <span className="text-gradient-agent">The agent ships the ticket.</span>
      </h1>
      <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
        Drop a free-text user story for your ETL project. Our AI refines it into a structured spec
        and ships it to Jira (project AEA) when you click Ship to Agent.
      </p>

      <div className="mt-16 text-left max-w-4xl mx-auto">
        <p className="font-mono text-xs tracking-widest text-agent-cyan mb-6">HOW IT WORKS</p>
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-xl border border-white/10 bg-card/40 p-5 backdrop-blur"
            >
              <span className="font-mono text-agent-cyan text-sm">{s.n}</span>
              <h3 className="font-semibold mt-1">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
