import { AgentOrb } from "./AgentOrb";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10 animate-gradient opacity-80"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="absolute inset-0 -z-10 bg-background/40" />
      <div className="container mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-foreground/80 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-agent-cyan animate-pulse" />
            AUTONOMOUS · ETL · AGENT
          </div>
          <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight">
            Describe your pipeline.{" "}
            <span className="text-gradient-agent">The agent files the ticket.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl">
            Drop a free-text user story for your ETL project. Our AI refines it into a
            structured spec and ships it straight to your Jira board (project AEA).
          </p>
          <div className="mt-7 flex gap-3">
            <a
              href="#intake"
              className="relative inline-flex items-center justify-center rounded-md px-5 py-2.5 font-medium text-foreground border border-white/15 overflow-hidden"
              style={{ background: "var(--gradient-agent)", boxShadow: "var(--shadow-glow)" }}
            >
              Submit a story
            </a>
            <a
              href="#how"
              className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 py-2.5 text-foreground/90 hover:bg-white/10 transition"
            >
              How it works
            </a>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <AgentOrb size={280} />
        </div>
      </div>
    </section>
  );
}
