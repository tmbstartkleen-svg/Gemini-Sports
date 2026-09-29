# TravAI Elite v7.4 — Autonomous Agent Workspace

TravAI v7.4 adds persistent governed autonomy to the offline-first Daily Driver. Missions are decomposed into dependency-aware tasks owned by specialist roles, checkpointed, resumable after restart, and blocked at explicit approval gates before consequential execution.

## v7.4 highlights
- persistent mission/task graph state
- Architect, Researcher, Operator, Tester, Reviewer, Release Guardian roles
- dependency-aware progression
- bounded retries and recovery metadata
- pause/resume
- evidence ledger and checkpoints
- explicit human approval before consequential execution
- v7.3 multimodal and v7.2 deployable control surface preserved

## Start
```bash
npm start
```
Open: `http://127.0.0.1:4783/?v=7400000000&view=agent-workspace&fresh=1`

## Safety
TravAI remains localhost-first. v7.4 adds no arbitrary shell capability and never silently crosses a consequential-action gate.
