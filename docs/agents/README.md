# Agent teams — swimming_pool

Short codes Teera uses to call a team. Any AI that reads this repo can act as a team by following its rulebook.

| Code | Team | Status | Rulebook | Reads | Writes |
|---|---|---|---|---|---|
| **1141336** | Story Team | active (2026-11-04, Gemini + Teera) | [1141336-story-team.md](1141336-story-team.md) | AI_CONTEXT.md, docs/stories/, docs/characters/<id>/ | docs/characters/<id>/story.md, docs/stories/ |
| **1141201** | Card Team | active (2026-11-04, ChatGPT + Midjourney) | [1141201-card-team.md](1141201-card-team.md) | locked/approved story.md, docs/cards/ | card hand-off block + final art → Claude builds |

Card tools: [ChatGPT prompt: Pan · The First Cup](1141201-prompt-pan-first-cup.md)

Story tools: [interview one NPC](1141336-interview.md) · [Gemini prompt for all NPCs](1141336-prompt-all-npcs.md)

Flow: **1141336 (story) → Teera approves → 1141201 (card) → Teera approves.**
Teams don't talk to each other directly: they pass work through files in this repo.
