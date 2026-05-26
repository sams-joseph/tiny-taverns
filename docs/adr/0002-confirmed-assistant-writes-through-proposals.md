# Confirmed Assistant Writes Through Proposals

Tiny Taverns does not let the assistant directly write durable campaign knowledge. Assistant tools create **Campaign Update Proposals** with reviewed target fields, and the DM confirms or rejects those proposals before they become NPCs, Campaign Notes, Campaign Session recaps, or other campaign knowledge.

This replaces direct write tools such as creating NPCs from chat because assistant conversations are working material, not campaign canon. Proposals are campaign-level records with a lifecycle, retain their original AI-proposed payload separately from the editable confirmable payload, and confirmation should be idempotent so retries do not create duplicate campaign knowledge.
