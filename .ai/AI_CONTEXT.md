# AI Context: ComplianceOS 2.0

> Read before exploring source code. Keep exploration targeted; this is an Indian MSME compliance platform.

## Project and Stack
ComplianceOS serves Indian MSMEs with profile intake, document verification, scheme discovery, regulatory monitoring, compliance action plans, deadline reminders, and CA workflows. Five named agents are ARIA, VEDA, SCOUT, SENTINEL, and PATHWAY.

- Primary backend: Node.js/Express ESM, Prisma, PostgreSQL (`complyos-backend-express/`).
- Frontend: React 18/Vite (`complyos-frontend/`).
- Legacy backend: FastAPI (`complyos-backend/`); active work is in Express.
- Integrations: Groq, LangGraph JS, LangChain Core, Zod, Google Cloud Vision, Sarvam, Cloudinary, TinyFish, WhatsApp, Razorpay.

## Useful Commands
Run from `complyos-backend-express/` unless noted:
- `npm run dev`, `npm start`
- `npm run prisma:generate`; `npx prisma db push`
- `npm run test:aria`; `npm run test:all`; `npm run test:integration`
- `npm run sentinel:run`
- ARIA evals: `npm run eval:aria:turns`, `eval:aria:slots`, `eval:aria:wer`, `eval:aria:taps`
- Seed: `node src/data/seed.js`

## Current Architecture
- `src/server.js` starts Express, Prisma, and jobs; `src/app.js` mounts API and chat routes.
- `src/orchestrator/handleEvent.js` validates inbound events, obtains/creates the user, enforces idempotency and per-user locking, loads profile/conversation state, invokes the graph, then persists changed profile/conversation and trace.
- `src/graph/runGraph.js` is the parent LangGraph workflow. `src/graph/router.js` deterministically routes event types to consent, deletion, home/menu, ARIA, VEDA, SCOUT, profile-conflict, and PATHWAY-stub nodes.
- `src/channels/` adapts WhatsApp and provider media to channel-neutral events. Web chat is in `src/routes/chat.js` (POST event and SSE stream).
- The detailed, code-grounded explanation and sequence diagrams are in [`docs/AGENT_ARCHITECTURE.md`](../docs/AGENT_ARCHITECTURE.md). Update that guide when graph wiring changes.

## Agent Ownership and Handoffs
- **ARIA**: Existing legacy handler is `src/agents/aria.js`; the newer per-turn engine is `src/agents/aria/`. The Stage B graph uses `src/graph/nodes/ariaNode.js` and `src/orchestrator/handleEvent.js` persists its returned profile/conversation. `src/graph/nodes/aria.node.js` is an older adapter. ARIA handles intake; profile merge/persistence belongs to parent/repositories.
- **VEDA**: Legacy upload route `src/routes/documents.js` still calls `src/agents/veda.js`. Modular LangGraph graph is `src/agents/veda/`; Stage B uses `src/graph/nodes/vedaNode.js`. Channel media code downloads/uploads documents before dispatch. Confirmation threads live in `ConversationState.pendingVeda`; parent routes resume events. Check active integration tests before changing this boundary.
- **SCOUT**: Legacy scheme routes still use `src/agents/scout.js`. Modular TypeScript runner is `src/agents/scout/entry.ts`, selected by `SCOUT_REAL=true`, otherwise mock. Matching is deterministic; unknown criteria mean `possible`, never eligible. The graph calls `src/graph/nodes/scoutNode.js`; ARIA can chain SCOUT at profile completion/home request. Scheme verification/discovery is separate; drafts require human review.
- **PATHWAY**: Existing `src/agents/pathway.js` returns curated checklists. Stage B graph currently has `pathwayStubNode.js`; do not imply the full legacy checklist is mounted there unless verified. Routes can still call the legacy helper.
- **SENTINEL**: `src/agents/sentinel/` crawls sources, stores snapshots/changes, validates evidence, matches profiles, and builds alerts. Stage B adds `sentinelDeliveryNode.js`; `src/jobs/cronJobs.js` and `src/jobs/sentinelCrawler.js` schedule/manual-trigger paths. Placeholder URLs are skipped. Alerts require citations, confidence/evidence gates, dedupe, caps, and simulated labels.

## Shared State and Persistence
- `src/graph/state.js` defines parent state; `src/contracts/common.js` defines shared event/profile/message/trace schemas; `src/contracts/profileFields.js` defines profile keys.
- `src/profile/mergePolicy.js` and `src/profile/projection.js` own profile merge/projection behavior. Route/agent code should not blindly overwrite stored profiles; preserve VERIFIED data and provenance.
- `src/repos/` contains user, profile, conversation, document, deadline, scheme, alert, consent, inbound-event, and trace repositories; `src/repos/memory/` provides test doubles.
- Prisma models include User, BusinessProfile, ARIASession, Document, ComplianceDeadline, Scheme/SchemeMatch, RegulationSource/Snapshot/Change/Alert, SentinelAlert, TinyFishCall, Notification, ConsentLog, and Subscription.
- `src/services/notify.js` centralizes in-app/WhatsApp delivery rules, template gating, session windows, and deduplication. User deletion is in `src/delete/deleteUserData.js`; consent/payment records are retained as specified by policy.
- `/api/agent-trace` is a presentation endpoint; use the trace repository/parent run IDs for execution tracing.

## Important Safety and Integration Notes
- Route/job/graph code decides routing. LLMs explain or extract only; deterministic code owns validation, eligibility, profile merges, penalties, and deadlines.
- ARIA: option taps must not call LLM; extracted updates need verbatim evidence; redact Aadhaar/PAN/OTP/password text before Groq; turnover bands are code-derived; never overwrite VERIFIED fields.
- VEDA: mask sensitive text before OCR-derived LLM extraction; gate uncertain/invalid fields and interrupt before profile/calendar commit.
- SCOUT: do not label `possible` as eligible; hide placeholder/unverified source data; discovery drafts are not user-facing.
- SENTINEL: skip `TODO_VERIFY_OFFICIAL_URL`; no alert without valid source/evidence; code decides targeting; simulated output must be labeled.
- PATHWAY is guidance only: no portal login, credential capture, or auto-filing. Statutory numbers use `src/rules/` or `src/utils/complianceCalculators.js`, never model guesses.
- Sarvam calls are through `src/services/sarvamService.js` using axios and `SARVAM_API_KEY`; provider formats/models need verification. Do not put secret values in `.ai/`.
- WhatsApp `WA_LIMITS`, provider audio behavior, external model/API details, and source URLs marked TODO require verification before production.
- After schema changes, run Prisma generation. Do not manually edit `package-lock.json` or generated Prisma client files.

## Environment Variable Names
`SARVAM_API_KEY`, `TINYFISH_API_KEY`, `TINYFISH_AGENT_DAILY_CAP`, `TEMPLATE_MODE`, `SENTINEL_TEMPLATE_NAME`. ARIA module flags are listed in backend `.env.example`; do not copy values/secrets into this file.

## Task Workflow
- Before each task, read `.ai/AI_CONTEXT.md`; search only the files needed. Use `.ai/file_index.json` and `.ai/project_graph.json` only with targeted `rg`/`jq` queries; never load them in full.
- If a task adds/removes/renames a route, model, module, component, command, environment variable, or dependency, update this file and add a dated one-line entry to `.ai/CHANGELOG.md` in the same change. Update docs when architecture changes.
- Keep this file under approximately 4,000 tokens. Replace stale details instead of appending. Never include secrets, `.env` values, or large code blocks.
