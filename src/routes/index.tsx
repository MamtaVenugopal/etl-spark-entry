import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { StoryIntake } from "@/components/landing/StoryIntake";
import { Capabilities } from "@/components/landing/Capabilities";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Autonomous ETL Agent — Story Intake" },
      {
        name: "description",
        content:
          "Describe your ETL pipeline in plain English. The agent refines it into a user story and files it in Jira (project AEA).",
      },
      { property: "og:title", content: "Autonomous ETL Agent — Story Intake" },
      {
        property: "og:description",
        content: "Free-text in. Structured Jira ticket out. Built for ETL teams.",
      },
    ],
  }),
});

function Index() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Hero />
      <HowItWorks />
      <StoryIntake />
      <Capabilities />
      <Footer />
      <Toaster richColors theme="dark" position="top-center" />
    </main>
  );
}
