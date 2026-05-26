/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "agent-cyan": "hsl(var(--agent-cyan) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        background: "hsl(var(--background) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
