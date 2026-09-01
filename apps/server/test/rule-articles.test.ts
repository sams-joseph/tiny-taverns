import { Actor, CurrentActor, type RuleArticleId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { RuleArticles } from "../src/repo/RuleArticles.js";
import { importSystemRuleArticles } from "../src/ruleset/rules.js";
import type { SystemRuleArticle } from "../src/ruleset/systemRules.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_rule_articles");
const services = servicesOver(database);
const runtime = ManagedRuntime.make(services.pipe(Layer.provideMerge(database)));
afterAll(() => runtime.dispose());

const run = <A, E>(
  effect: Effect.Effect<A, E, Accounts | Campaigns | RuleArticles | SqlClient.SqlClient>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(effect: (client: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  run(Effect.flatMap(SqlClient.SqlClient, effect));

const article = (
  sourceIndex: string,
  name: string,
  sectionText = "Original text.",
): SystemRuleArticle => ({
  sourceIndex,
  name,
  content: `# ${name}\n\nAn imported top-level rule.`,
  sections: [
    {
      sourceIndex: `${sourceIndex}-section`,
      title: "Imported Section",
      content: `## Imported Section\n\n${sectionText}`,
      ordinal: 0,
      parentSourceIndex: null,
    },
  ],
});

describe("2014 rules compendium import", () => {
  it("imports the pinned six rules and thirty-three ordered sections", async () => {
    const first = await run(importSystemRuleArticles());
    const second = await run(importSystemRuleArticles());

    expect(first).toEqual({ articlesInserted: 6, articlesUpdated: 0, sections: 33 });
    expect(second).toEqual({ articlesInserted: 0, articlesUpdated: 6, sections: 33 });

    const counts = await sql(
      (client) => client<{
        readonly articles: number;
        readonly sections: number;
        readonly urls: number;
      }>`
        select
          (select count(*)::int from rule_article where origin = 'system') as articles,
          (select count(*)::int from rule_section) as sections,
          (
            select count(*)::int
            from rule_article
            where body::text like '%/api/2014%'
          ) + (
            select count(*)::int
            from rule_section
            where body::text like '%/api/2014%'
          ) as urls
      `,
    );

    expect(counts).toEqual([{ articles: 6, sections: 33, urls: 0 }]);

    const combat = await sql(
      (client) => client<{
        readonly article_key: string;
        readonly article_name: string;
        readonly section_key: string;
        readonly title: string;
        readonly ordinal: number;
      }>`
        select
          rule_article.source_key as article_key,
          rule_article.name as article_name,
          rule_section.source_key as section_key,
          rule_section.title,
          rule_section.ordinal
        from rule_article
        join rule_section on rule_section.article_id = rule_article.id
        where rule_article.source_key = 'combat'
        order by rule_section.ordinal
      `,
    );

    expect(combat.map((row) => row.section_key)).toEqual([
      "the-order-of-combat",
      "movement-and-position",
      "actions-in-combat",
      "making-an-attack",
      "cover",
      "damage-and-healing",
      "mounted-combat",
      "underwater-combat",
    ]);
    expect(combat[0]).toMatchObject({
      article_key: "combat",
      article_name: "Combat",
      title: "The Order of Combat",
      ordinal: 0,
    });
  });

  it("stores formatted reference content as blocks, including tables and lists", async () => {
    await run(importSystemRuleArticles());

    const rows = await sql(
      (client) => client<{ readonly title: string; readonly body: unknown }>`
        select title, body
        from rule_section
        where source_key = 'standard-exchange-rates'
      `,
    );

    expect(rows).toHaveLength(1);
    const blocks = rows[0]!.body as Array<Record<string, unknown>>;
    expect(blocks[0]).toEqual({ kind: "heading", depth: 2, text: "Standard Exchange Rates" });
    expect(blocks[1]).toMatchObject({
      kind: "table",
      columns: ["Coin", "CP", "SP", "EP", "GP", "PP"],
    });
    expect((blocks[1] as { readonly rows: ReadonlyArray<ReadonlyArray<string>> }).rows[3]).toEqual([
      "Gold (gp)",
      "100",
      "10",
      "2",
      "1",
      "1/10",
    ]);

    const attack = await sql(
      (client) => client<{ readonly body: unknown }>`
        select body
        from rule_section
        where source_key = 'making-an-attack'
      `,
    );
    const attackBlocks = attack[0]!.body as Array<Record<string, unknown>>;
    expect(attackBlocks.some((block) => block.kind === "list")).toBe(true);
  });

  it("authors Library articles, finds them by section text, and copies snapshots into a campaign", async () => {
    const dm = await run(
      Accounts.pipe(Effect.flatMap((accounts) => accounts.issue("Compendium DM"))),
    );
    const actor = new Actor({ accountId: dm.accountId, campaignId: null });
    const campaign = await run(
      Campaigns.pipe(
        Effect.flatMap((campaigns) => campaigns.create({ name: "The Reference Road" })),
        Effect.provideService(CurrentActor, actor),
      ),
    );

    const created = await run(
      RuleArticles.pipe(
        Effect.flatMap((articles) =>
          articles.libraryCreate({
            name: "House Weather",
            intro: "# House Weather\n\nHow storms work at this table.",
            sections: [
              { title: "Storm Glass", content: "## Storm Glass\n\nFog answers the bell." },
            ],
          }),
        ),
        Effect.provideService(CurrentActor, actor),
      ),
    );

    expect(created.article.accountId).toBe(dm.accountId);
    expect(created.article.campaignId).toBeNull();
    expect(created.sections.map((section) => section.title)).toEqual(["Storm Glass"]);

    const found = await run(
      RuleArticles.pipe(
        Effect.flatMap((articles) => articles.library({ q: "bell" })),
        Effect.provideService(CurrentActor, actor),
      ),
    );
    expect(found.items.map((row) => row.name)).toContain("House Weather");

    const copy = await run(
      RuleArticles.pipe(
        Effect.flatMap((articles) =>
          articles.derive(campaign.id, created.article.id, { visibility: "shared" }),
        ),
        Effect.provideService(CurrentActor, actor),
      ),
    );
    expect(copy.article.campaignId).toBe(campaign.id);
    expect(copy.article.accountId).toBeNull();
    expect(copy.article.derivedFrom).toBe(created.article.id);
    expect(copy.sections[0]?.blocks).toEqual(created.sections[0]?.blocks);
  });

  it("leaves campaign copies unchanged after a system source update", async () => {
    const dm = await run(
      Accounts.pipe(Effect.flatMap((accounts) => accounts.issue("Snapshot DM"))),
    );
    const actor = new Actor({ accountId: dm.accountId, campaignId: null });
    const campaign = await run(
      Campaigns.pipe(
        Effect.flatMap((campaigns) => campaigns.create({ name: "The Snapshot Road" })),
        Effect.provideService(CurrentActor, actor),
      ),
    );

    const source = "source-test-rule-snapshot";
    await run(importSystemRuleArticles([article(source, "Snapshot Rule", "First version.")]));
    const sourceRows = await sql(
      (client) => client<{ readonly id: RuleArticleId }>`
        select id::text as id
        from rule_article
        where source_key = ${source}
      `,
    );
    const sourceId = sourceRows[0]!.id;

    await run(
      RuleArticles.pipe(
        Effect.flatMap((articles) => articles.derive(campaign.id, sourceId, {})),
        Effect.provideService(CurrentActor, actor),
      ),
    );

    await run(
      importSystemRuleArticles([article(source, "Snapshot Rule Revised", "Second version.")]),
    );

    const rows = await sql(
      (client) => client<{
        readonly name: string;
        readonly campaign_id: string | null;
        readonly section_text: string;
      }>`
        select
          rule_article.name,
          rule_article.campaign_id::text,
          rule_section.body::text as section_text
        from rule_article
        join rule_section on rule_section.article_id = rule_article.id
        where rule_article.source_key = ${source}
        order by rule_article.campaign_id nulls first
      `,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Snapshot Rule Revised", campaign_id: null });
    expect(rows[0]!.section_text).toContain("Second version");
    expect(rows[1]).toMatchObject({ name: "Snapshot Rule", campaign_id: campaign.id });
    expect(rows[1]!.section_text).toContain("First version");
  });
});
