import { ChatRpc } from "./chat-rpc.js";
import { UsersRpc } from "./users-rpc.js";
import { NpcRpc } from "./npc-rpc.js";

export class AppRpc extends UsersRpc.merge(ChatRpc).merge(NpcRpc) {}
