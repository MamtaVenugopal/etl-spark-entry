export function Footer() {
  return (
    <footer className="border-t border-white/10 mt-10">
      <div className="container mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="font-mono">autonomous-etl-agent · v0.1</div>
        <div>Tickets ship to Jira project <span className="font-mono text-foreground/80">AEA</span></div>
      </div>
    </footer>
  );
}
