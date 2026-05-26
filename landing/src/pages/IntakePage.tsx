import { useEffect, useState } from "react";
import { LandingHero } from "@/components/LandingHero";
import { StoryIntakeForm } from "@/components/StoryIntakeForm";
import { fetchHealth } from "@/lib/api";

export function IntakePage() {
  const [autoGates, setAutoGates] = useState(false);

  useEffect(() => {
    fetchHealth().then((h) => {
      if (h) setAutoGates(Boolean(h.auto_gate_1 && h.auto_gate_2));
    });
  }, []);

  return (
    <>
      <LandingHero />
      <StoryIntakeForm autoGates={autoGates} />
      <footer className="container mx-auto px-6 py-8 text-center text-xs text-muted-foreground font-mono">
        autonomous-etl-agent · story landing · tickets ship to Jira project AEA
      </footer>
    </>
  );
}
