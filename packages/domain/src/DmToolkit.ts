import * as Tool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import { CreateQuestPayload, Quest } from "./QuestsApi.js";
import { TransientResponse } from "./Toolkit.js";

export class dmToolkit extends Toolkit.make(
  Tool.make("CreateQuest", {
    description: "Create a new quest with full payload details for the DM.",
    parameters: {
      quest: CreateQuestPayload,
    },
    success: TransientResponse(Quest),
  }),
) {}
