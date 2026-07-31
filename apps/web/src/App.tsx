import { useState } from "react";
import { Button } from "@taverns/ui";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "40rem" }}>
      <h1>Taverns</h1>
      <p>A pnpm + Turborepo starter with a Vite React SPA and an Effect.ts server.</p>
      <p data-testid="count">Tabs opened: {count}</p>
      <Button onClick={() => setCount((current) => current + 1)}>Open a tab</Button>
    </main>
  );
}
