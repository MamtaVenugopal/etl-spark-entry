import type { StructuredStory } from "./types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function inferTargetTable(story: StructuredStory): string {
  if (story.target_table?.startsWith("gold.")) return story.target_table;
  if (story.target_table) return `gold.${story.target_table.replace(/^gold\./, "")}`;
  const fromTarget = slugify(story.target);
  if (fromTarget) return `gold.${fromTarget}`;
  return `gold.${slugify(story.title) || "pipeline_output"}`;
}

function inferSourceTables(story: StructuredStory): string[] {
  if (story.source_tables?.length) return story.source_tables;
  const blob = `${story.source} ${story.iWant} ${story.transformations.join(" ")}`.toLowerCase();
  const tables: string[] = [];
  const candidates = [
    "olist_orders_raw",
    "olist_order_items_raw",
    "olist_products_raw",
    "olist_category_translation_raw",
    "olist_customers_raw",
    "olist_sellers_raw",
  ];
  for (const t of candidates) {
    const short = t.replace("olist_", "").replace("_raw", "");
    if (blob.includes(short.replace(/_/g, " ")) || blob.includes(t)) {
      tables.push(t);
    }
  }
  if (tables.length === 0) {
    tables.push("olist_orders_raw", "olist_order_items_raw");
  }
  return tables;
}

/** Convert UI structured story → ETL YAML for POST /stories (Agent 1 fast-path). */
export function storyToYaml(story: StructuredStory, storyId: string): string {
  const target_table = inferTargetTable(story);
  const source_tables = inferSourceTables(story);
  const lines = [
    `story_id: ${storyId}`,
    `title: "${story.title.replace(/"/g, '\\"')}"`,
    `intent: ${story.intent || "aggregate"}`,
    "data_platform: aws",
    "storage_format: parquet",
    "glue_database_bronze: bronze",
    "glue_database_gold: gold",
    "orchestration: mwaa_emr",
    "source_tables:",
    ...source_tables.map((t) => `  - ${t}`),
    `target_table: ${target_table}`,
    "key_transformations:",
    ...story.transformations.map((t) => `  - ${JSON.stringify(t)}`),
    "acceptance_criteria:",
    ...story.acceptanceCriteria.map((c) => `  - ${JSON.stringify(c)}`),
  ];
  return lines.join("\n") + "\n";
}
