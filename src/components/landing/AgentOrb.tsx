export function AgentOrb({ size = 220 }: { size?: number }) {
  return (
    <div
      className="relative animate-float"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-70 animate-orb"
        style={{ background: "var(--gradient-agent)" }}
      />
      <div
        className="absolute inset-6 rounded-full animate-orb"
        style={{
          background: "var(--gradient-agent)",
          backgroundSize: "200% 200%",
          boxShadow: "var(--shadow-glow)",
        }}
      />
      <div
        className="absolute inset-12 rounded-full bg-background/40 backdrop-blur-md border border-white/10 flex items-center justify-center"
      >
        <span className="font-mono text-xs tracking-widest text-foreground/80">AGENT</span>
      </div>
    </div>
  );
}
