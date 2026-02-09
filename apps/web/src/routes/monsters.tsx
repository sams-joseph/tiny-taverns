import { Result, useAtomValue } from "@effect-atom/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { DomainRpcClient } from "../atoms/atom";
import { Cause } from "effect";

export const Route = createFileRoute("/monsters")({
  component: Monsters,
});

function Monsters() {
  const monsters = useAtomValue(
    DomainRpcClient.query("MonsterList", void 0, {
      reactivityKeys: ["MonsterList"],
    }),
  );

  return (
    <div className="p-2">
      {Result.builder(monsters)
        .onInitial(() => <div>Loading...</div>)
        .onFailure((cause) => <div>Error: {Cause.pretty(cause)}</div>)
        .onSuccess(({ items }, { waiting }) => (
          <div>
            <ul>
              {items.map((item) => (
                <li key={item.id}>{JSON.stringify(item)}</li>
              ))}
            </ul>
            {waiting ? <p>Loading more...</p> : <p>Loaded chunk</p>}
          </div>
        ))
        .render()}
    </div>
  );
}
