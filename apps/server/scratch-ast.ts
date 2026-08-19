import { TavernsApi } from "@taverns/api";

const show = (ast: any, depth = 0): string => {
  const pad = "  ".repeat(depth);
  if (ast === undefined) return `${pad}undefined`;
  let out = `${pad}${ast._tag}`;
  if (ast.encoding !== undefined) out += " [enc]";
  if (ast._tag === "UnionType" || ast._tag === "Union") {
    out += "\n" + ast.types.map((t: any) => show(t, depth + 1)).join("\n");
  }
  if (ast._tag === "TupleType" || ast._tag === "Tuple") {
    out += " <array>";
  }
  return out;
};

const q = (Object.values(TavernsApi.groups) as any[]).flatMap((g: any) =>
  Object.values(g.endpoints).map((e: any) => ({ id: `${g.identifier}.${e.identifier}`, query: e.query })),
).filter((e) => e.query !== undefined);

for (const e of q) {
  console.log("###", e.id);
  for (const p of e.query.ast.propertySignatures ?? []) {
    console.log(" -", p.name);
    console.log(show(p.type, 3));
  }
}
