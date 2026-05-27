import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="min-h-full bg-surface text-foreground w-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        Home
      </div>
    </main>
  );
}
