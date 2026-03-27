# Task: Sprint Planning — Brownfield

**Purpose**: Validate a sprint candidate before committing to it.
Detects conflicts, blocked stories, and ordering constraints using structural analysis.

**Who runs this**: Scrum Master Agent or Architect Agent, during sprint planning.
**When**: Before the sprint is locked — after stories are written, before they're assigned.

**Output**: sprint risk report + recommended story order + blocking issues list.

---

## Prerequisites

- Brownfield onboarding completed (`bmad/tasks/brownfield-onboarding.md`)
- All sprint candidate stories have a `risk_context` section (see `bmad/templates/story-brownfield.md`)
- If `risk_context` is missing on any story, run the Architect brownfield agent on it first

---

## Step 1 — Refresh the structural analysis

If the last `analyze_codebase` run was more than 24 hours ago, or if code changed since then:

```xml
<use_mcp_tool>
  <server_name>spec-gen</server_name>
  <tool_name>analyze_codebase</tool_name>
  <arguments>{"directory": "$PROJECT_ROOT", "force": false}</arguments>
</use_mcp_tool>
```

---

## Step 2 — Assess each story

For each story in the sprint candidate list, call `generate_change_proposal`.
Use the story title + primary AC as the description.

```xml
<use_mcp_tool>
  <server_name>spec-gen</server_name>
  <tool_name>generate_change_proposal</tool_name>
  <arguments>{
    "directory": "$PROJECT_ROOT",
    "description": "$STORY_TITLE — $PRIMARY_AC",
    "slug": "$STORY_ID"
  }</arguments>
</use_mcp_tool>
```

Collect for each story:
- `domainsAffected`
- `maxRiskScore` + `riskLevel`
- `functionsFound` (list of top functions)

---

## Step 3 — Build the sprint risk matrix

| Story | Domains | Risk | Blocking Refactors | Status |
|---|---|---|---|---|
| S-01 Add retry | payment | 🔴 82 | `processPayment` | ⛔ blocked |
| S-02 Email validation | auth | 🟢 18 | none | ✅ ready |
| S-03 Rate limiting | api | 🟡 45 | none | ⚠️ caution |

**Status rules:**
- ⛔ **blocked**: maxRiskScore ≥ 70 and no refactor story scheduled before it
- ⚠️ **caution**: maxRiskScore 40–69, or story touches a critical hub
- ✅ **ready**: maxRiskScore < 40 and no hub involvement

---

## Step 4 — Detect domain conflicts

Find stories that touch the same domains or functions:

```xml
<use_mcp_tool>
  <server_name>spec-gen</server_name>
  <tool_name>get_critical_hubs</tool_name>
  <arguments>{"directory": "$PROJECT_ROOT", "limit": 10}</arguments>
</use_mcp_tool>
```

For any hub function that appears in multiple stories' scope:

> "⚠️ Stories S-01 and S-04 both affect `processPayment` (fan-in: 12).
> Parallel implementation risk: merge conflicts and silent regressions.
> Recommend: sequence them — S-04 after S-01, or assign to the same developer."

---

## Step 5 — Check spec coverage

Identify stories that will introduce code with no spec coverage:

```xml
<use_mcp_tool>
  <server_name>spec-gen</server_name>
  <tool_name>check_spec_drift</tool_name>
  <arguments>{"directory": "$PROJECT_ROOT"}</arguments>
</use_mcp_tool>
```

For any `uncovered` files already present:
> "These files have no spec coverage. Stories touching them cannot use `check_spec_drift`
> as a completion gate. Recommend: add a spec generation task to the sprint."

---

## Step 6 — Determine story ordering

Based on the risk matrix and conflict analysis, produce a recommended execution order:

**Rules:**
1. Refactor stories before the stories they unblock
2. Stories touching the same hub: sequence, do not parallelise
3. Low-risk stories can be parallelised freely
4. Spec generation (`spec-gen generate`) after any story that adds new files

**Example output:**

```
Sprint Execution Order:

Week 1:
  [DAY 1-2]  S-05: Refactor processPayment (unblocks S-01)
  [DAY 1-3]  S-02: Email validation (independent, low risk)

Week 2:
  [DAY 1-2]  S-01: Add payment retry (now unblocked)
  [DAY 3]    S-03: Rate limiting (caution — same dev as S-01 preferred)
  [DAY 4]    Run spec-gen generate (update specs after S-01, S-02, S-03)
```

---

## Step 7 — Sprint readiness verdict

| Criterion | Status |
|---|---|
| No blocked stories without prior refactor | ✅ / ⛔ |
| No parallel stories on same hub | ✅ / ⚠️ |
| All stories have `risk_context` | ✅ / ⛔ |
| Spec coverage adequate for drift detection | ✅ / ⚠️ |

If any ⛔ remain: **do not lock the sprint**. Resolve blockers first.

---

## Output

Write the sprint plan to `openspec/changes/sprint-{N}/proposal.md` (or your BMAD sprint doc):

```markdown
# Sprint {N} — Risk Report

Generated: {date}

## Risk Matrix
{table from Step 3}

## Conflicts
{list from Step 4}

## Recommended Order
{order from Step 6}

## Readiness
{verdict from Step 7}
```
