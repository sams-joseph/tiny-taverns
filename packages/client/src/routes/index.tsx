import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="min-h-full bg-surface text-foreground w-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/campaigns"
            className="rounded-2xl border border-border bg-elevated p-5 transition-colors hover:border-border-hover"
          >
            <h2 className="font-medium">Campaigns</h2>
          </Link>
        </div>
      </div>
    </main>
  );
}
