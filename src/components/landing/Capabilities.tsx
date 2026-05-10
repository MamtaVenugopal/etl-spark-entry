const items = [
  { t: "Source-aware", d: "S3, Postgres, Kafka, REST APIs, SaaS connectors." },
  { t: "Schema reasoning", d: "Detect drift, infer types, suggest mappings." },
  { t: "Transformations", d: "Joins, dedupe, PII masking, slowly-changing dims." },
  { t: "Quality gates", d: "Row counts, null thresholds, freshness SLAs." },
  { t: "Warehouse-ready", d: "Snowflake, BigQuery, Redshift, Databricks targets." },
  { t: "Observability", d: "Lineage, retries, alerting baked in." },
];

export function Capabilities() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          What the agent can <span className="text-gradient-agent">handle</span>
        </h2>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.t}
            className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 hover:border-white/20 transition"
          >
            <div className="text-base font-semibold">{it.t}</div>
            <div className="mt-1 text-sm text-muted-foreground">{it.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
