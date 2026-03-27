# BMAD + spec-gen Integration Guide

This guide explains how to connect [BMAD Method](https://docs.bmad-method.org) with spec-gen
to enable safe, spec-driven development on brownfield codebases.

## Why

BMAD is designed for structured, spec-first development. On brownfield codebases
(existing code without explicit architecture documentation), agents lack the structural
context needed to plan and implement safely.

The key principle: **structural reality must be known at architecture time, not at
implementation time.** spec-gen provides that context via MCP at every phase of the
BMAD workflow.

## Full Workflow

```
── ARCHITECTURE PHASE ──────────────────────────────────────────────────────────

  Brownfield Onboarding          ← bmad/tasks/brownfield-onboarding.md (run once)
       │  spec-gen analyze + generate
       ▼
  Architect Agent                ← bmad/agents/architect-brownfield.md
       │  get_architecture_overview
       │  get_refactor_report          → no-touch zones
       │  get_critical_hubs            → hub risk landscape
       │  generate_change_proposal     → per epic
       ▼
  architecture.md                ← structural reality + target + gap = debt backlog
       │
       ▼
  Technical Debt Stories         ← refactor stories created BEFORE feature stories

── PLANNING PHASE ──────────────────────────────────────────────────────────────

  PM Agent                       ← uses story-brownfield template
       │  risk_context pre-filled from architect output
       ▼
  Sprint Candidate               ← stories with risk_context embedded
       │
       ▼
  Sprint Planning                ← bmad/tasks/sprint-planning-brownfield.md
       │  generate_change_proposal    → per story
       │  get_critical_hubs           → conflict detection
       │  check_spec_drift            → coverage gaps
       ▼
  Sprint Plan                    ← risk matrix + story order + blocked list

── IMPLEMENTATION PHASE ────────────────────────────────────────────────────────

  Dev Agent                      ← bmad/agents/dev-brownfield.md
       │  reads risk_context from story (already known)
       │  orient + analyze_impact    → confirm + verify, not discover
       ▼
  Implementation + check_spec_drift
       │
       ▼
  spec-gen generate               ← update specs post-sprint
```

## Architecture (MCP layer)

```
BMAD Agents (Architect / PM / SM / Dev)
    │
    │  MCP calls
    ▼
spec-gen MCP Server
    │
    ├── analyze_codebase          → build/refresh call graph
    ├── get_architecture_overview → domain clusters, hubs, entry points
    ├── get_refactor_report       → no-touch zones, priority scores
    ├── get_critical_hubs         → fan-in bottlenecks
    ├── generate_change_proposal  → per epic/story → proposal.md
    ├── orient                    → story → functions + insertion points
    ├── analyze_impact            → blast radius + risk score
    ├── search_specs / get_spec   → existing requirements
    ├── check_spec_drift          → post-implementation verification
    └── ... 17 other tools
    │
    ▼
Codebase (brownfield) + openspec/ (specs)
```

## Setup

### 1. Install spec-gen

```bash
npm install -g spec-gen
# or from this repo:
npm install && npm run build
```

### 2. Connect spec-gen as an MCP server

In your Claude Code / Cline / Cursor MCP configuration:

```json
{
  "mcpServers": {
    "spec-gen": {
      "command": "node",
      "args": ["/path/to/spec-gen/dist/cli/index.js", "mcp", "--watch-auto"]
    }
  }
}
```

### 3. Copy BMAD integration files into your project

```bash
cp -r /path/to/spec-gen/bmad/ ./bmad/
```

### 4. Architecture phase setup (run once, before first sprint)

**Step 4a — Brownfield onboarding** (prerequisite for architecture, not for dev):

Open `bmad/tasks/brownfield-onboarding.md` with your Architect Agent and follow the steps.
This builds the structural baseline the architect needs to write a grounded architecture doc.

**Step 4b — Architect brownfield analysis**:

Load `bmad/agents/architect-brownfield.md` into your Architect Agent.
It will run structural analysis, identify no-touch zones, assess epics, and produce:
- `docs/architecture.md` with a "Structural Reality" section
- Technical debt stories for the backlog
- `risk_context` annotations on feature stories

### 5. Sprint planning

Before each sprint, load `bmad/tasks/sprint-planning-brownfield.md` with your SM/Architect Agent.
It validates the sprint candidate, detects conflicts, and recommends story ordering.

### 6. Load agent extensions

In your project's `CLAUDE.md` (or BMAD agent configuration):

```markdown
@bmad/agents/architect-brownfield.md   ← for Architect Agent sessions
@bmad/agents/dev-brownfield.md         ← for Dev Agent sessions
```

---

## File Reference

### Agent Extensions

| File | Phase | Purpose |
|---|---|---|
| `bmad/agents/architect-brownfield.md` | Architecture | Structural reality check before design; epic risk assessment |
| `bmad/agents/dev-brownfield.md` | Implementation | Pre-implementation gate; scope enforcement |

### Tasks

| File | Phase | Who | Purpose |
|---|---|---|---|
| `bmad/tasks/brownfield-onboarding.md` | **Architecture** | Architect | One-time structural baseline — run before first sprint |
| `bmad/tasks/sprint-planning-brownfield.md` | **Planning** | SM / Architect | Per-sprint risk matrix, conflict detection, story ordering |
| `bmad/tasks/implement-story-brownfield.md` | Implementation | Dev | Story implementation with pre-filled risk context |
| `bmad/tasks/brownfield-refactor.md` | Implementation | Dev | Safe refactor when risk ≥ 70 blocks a story |

### Templates

| File | Purpose |
|---|---|
| `bmad/templates/story-brownfield.md` | Story template with `risk_context` section (pre-filled by Architect) |

---

## Workflow

### Normal story (low-risk codebase area)

```
Story → orient → analyze_impact (risk < 40) → implement → check_spec_drift → done
```

### Story touching a risky function (risk 40–69)

```
Story → orient → analyze_impact (risk 40–69) → implement with care → check_spec_drift → done
```

### Story blocked by high-risk function (risk ≥ 70)

```
Story → orient → analyze_impact (risk ≥ 70)
                      │
                      ▼
              brownfield-refactor task
                      │
                      ▼
              riskScore < 70?
                      │
                      ▼
              return to story → implement → check_spec_drift → done
```

---

## Integration with OpenSpec

spec-gen generates OpenSpec specifications (`openspec/`) from brownfield code.
Once generated, BMAD's architecture agent and PM agent can read these specs to understand
the existing system before planning new stories.

Key spec files after onboarding:

```
openspec/
├── specs/
│   ├── overview/spec.md         ← system summary for PM / Architect agents
│   ├── architecture/spec.md     ← risk register + structural notes
│   └── {domain}/spec.md         ← per-domain requirements
```

The `search_specs` and `get_spec` MCP tools let dev agents query these specs
during story implementation without leaving their context window.

---

## spec-gen MCP Tools Used by BMAD Tasks

| Tool | Used in | Purpose |
|---|---|---|
| `analyze_codebase` | onboarding | Build/refresh call graph |
| `orient` | implement-story | Map story to functions in one call |
| `analyze_impact` | implement-story, refactor | Risk score + blast radius |
| `get_architecture_overview` | onboarding | Domain clusters + hubs |
| `get_refactor_report` | onboarding, refactor | High-priority refactor candidates |
| `get_duplicate_report` | onboarding, refactor | Clone groups |
| `suggest_insertion_points` | implement-story, refactor | Where to add code |
| `get_subgraph` | implement-story, refactor | Call neighbourhood (Mermaid) |
| `get_function_skeleton` | implement-story | Noise-stripped file view |
| `search_specs` | implement-story | Find relevant requirements |
| `get_spec` | implement-story | Read full domain spec |
| `check_spec_drift` | implement-story | Post-implementation verification |
| `get_low_risk_refactor_candidates` | refactor | Safe extraction targets |
| `get_mapping` | refactor | Dead code / naming alignment |

---

## Troubleshooting

### `orient` returns 0 results

The analysis cache is missing or stale. Run:

```bash
spec-gen analyze
```

Or via MCP:
```xml
<use_mcp_tool>
  <server_name>spec-gen</server_name>
  <tool_name>analyze_codebase</tool_name>
  <arguments>{"directory": "$PROJECT_ROOT", "force": true}</arguments>
</use_mcp_tool>
```

### `search_specs` returns "index not found"

The semantic index is missing. Run:

```bash
spec-gen analyze --embed
```

### `check_spec_drift` shows many `uncovered` files

OpenSpec has not been generated yet. Run:

```bash
spec-gen generate
```

### Risk scores are unexpectedly high everywhere

This is a brownfield signal — the codebase has accumulated complexity. Start with the
`brownfield-onboarding` task to build a risk register and identify which areas are safe
to work in without first refactoring.
