import * as Tool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import {
  CreateQuestPayload,
  Quest,
  QuestEncounterLink,
  QuestEncounterLinkPayload,
} from "./QuestsApi.js";
import { CreateEncounterPayload, Encounter } from "./EncountersApi.js";
import { TransientResponse } from "./Toolkit.js";

export class dmToolkit extends Toolkit.make(
  Tool.make("CreateQuest", {
    description: "Create a new quest with full payload details for the DM.",
    parameters: {
      quest: CreateQuestPayload,
    },
    success: TransientResponse(Quest),
  }),
  Tool.make("CreateEncounter", {
    description:
      "Create a new encounter for the campaign and return the encounter.",
    parameters: {
      encounter: CreateEncounterPayload,
    },
    success: TransientResponse(Encounter),
  }),
  Tool.make("QuestEncounterLink", {
    description: "Link an encounter to a quest or subquest.",
    parameters: {
      link: QuestEncounterLinkPayload,
    },
    success: TransientResponse(QuestEncounterLink),
  }),
) {}
