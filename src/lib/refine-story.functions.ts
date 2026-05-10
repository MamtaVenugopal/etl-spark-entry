import { createServerFn } from "@tanstack/react-start";
import { EtlStorySchema, RawInputSchema, type EtlStory } from "./etl-story.schema";

export const refineEtlStory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RawInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ story: EtlStory | null; error: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { story: null, error: "AI gateway not configured." };

    const systemPrompt = `You are an expert business analyst for Autonomous ETL Agent projects. Convert the user's free-text description into a clean, structured user story. Be precise and concise. If something is missing, infer a sensible default. Return ONLY a JSON object matching the provided schema.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: data.raw },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_user_story",
                description: "Emit the structured ETL user story.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    asA: { type: "string", description: "Persona, e.g. 'Data Engineer'" },
                    iWant: { type: "string" },
                    soThat: { type: "string" },
                    source: { type: "string", description: "Source system / dataset" },
                    target: { type: "string", description: "Target system / warehouse" },
                    transformations: { type: "array", items: { type: "string" } },
                    acceptanceCriteria: { type: "array", items: { type: "string" } },
                    priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
                    estimate: { type: "string" },
                  },
                  required: [
                    "title",
                    "asA",
                    "iWant",
                    "soThat",
                    "source",
                    "target",
                    "transformations",
                    "acceptanceCriteria",
                    "priority",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "emit_user_story" } },
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        if (res.status === 429) return { story: null, error: "Rate limit reached. Try again shortly." };
        if (res.status === 402) return { story: null, error: "AI credits exhausted." };
        return { story: null, error: `AI request failed (${res.status}).` };
      }

      const json = await res.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall?.function?.arguments;
      if (!args) return { story: null, error: "AI returned no structured output." };
      const parsed = EtlStorySchema.parse(typeof args === "string" ? JSON.parse(args) : args);
      return { story: parsed, error: null };
    } catch (e) {
      console.error("refineEtlStory failed", e);
      return { story: null, error: "Could not refine story. Please try again." };
    }
  });
