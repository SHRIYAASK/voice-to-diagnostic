# Hybrid Retrieval & Diagnostic Routing Audit & Fix Plan
## ApplianceCare AI Architecture Remediation

> **System:** ApplianceCare AI Diagnostic Engine  
> **Author:** Senior AI & Retrieval Architect  
> **Status:** Active Execution Plan  
> **Scope:** Namespace Separation, Deterministic Routing, Error Code Registry, Global Instruction Mapping, Metadata-Filtered Retrieval, Safety Gating, Decision Tree Validation & Automated Tests  

---

## 1. Executive Summary & Problem Analysis

The initial audit of the ApplianceCare AI codebase revealed critical retrieval and architectural risks:
1. **Namespace Collision Risk:** Symptom tree IDs (`AC01`–`AC16`) and displayed fault codes (`CH01`–`CH97`) risked ambiguity in voice and regex matching (e.g., `AC01` vs `CH01`).
2. **Lack of Pre-RAG Deterministic Routing:** Natural language inputs bypass structured routing straight to heuristic classification without deterministic triage gates.
3. **Data Inconsistency in Error Codes:** 
   - Decision Tree `AC03` references codes (`CH09`, `CH12`, `CH35`, `CH38`, `CH41`, `CH61`, `CH62`) absent from `lg_ac_error_codes.json`.
   - `lg_ac_error_codes.json` contains 10 codes (`CH03`, `CH04`, `CH07`, `CH08`, `CH13`, `CH24`, `CH33`, `CH40`, `CH65`, `CH97`) with no diagnostic flow in `AC03`.
   - Direct conflicts exist: `CH06` (Fan Motor in lookup vs Fan/Pipe Temp Sensor in AC03) and `CH10` (Drain Overflow in lookup vs Indoor Blower Motor Lock in AC03).
4. **Missing Action ID Resolution:** Action IDs such as `instruct_clean_dry_filter` and `instruct_hard_reset_mcb` were defined in tree edges but lacked a structured instruction registry.
5. **Absence of Metadata-Filtered Retrieval & Safety Enforcement:** No chunking pipeline with metadata filters (`audience`, `model`, `appliance_type`, `verification_status`), risking exposure of technician-only electrical procedures (230V, multimeter, capacitor discharge) to ordinary customers.
6. **No Tree Integrity Verification:** Decision tree nodes and action references were unverified by automated graph checks.

---

## 2. Remediation Architecture & Request Flow

```
                      +---------------------------------------+
                      |       Incoming User Request           |
                      |   (Voice Transcript / Chat / Chip)    |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |   Phase 1: Deterministic Normalizer   |
                      |   - normalizeAcIssueId (AC01-AC16)    |
                      |   - normalizeChErrorCode (CH01-CH97)  |
                      |   - Spoken number conversion          |
                      |   - Ambiguity detector                |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |   Phase 2: Deterministic Router       |
                      |   Routes to 1 of 6 Intent Types:      |
                      |   1. EXPLICIT_ERROR_CODE              |
                      |   2. SYMPTOM_TROUBLESHOOTING          |
                      |   3. INSTRUCTION_REQUEST              |
                      |   4. TECHNICAL_SPECIFICATION          |
                      |   5. WARRANTY_POLICY                  |
                      |   6. GENERAL_APPLIANCE                |
                      +---------------------------------------+
                                          |
        +------------------+--------------+------------------+------------------+
        |                  |                                 |                  |
        v                  v                                 v                  v
 [1. Error Code]    [2. Symptom]                      [3. Instruction]    [4/5/6. Spec/Warranty/General]
        |                  |                                 |                  |
        v                  v                                 v                  v
+---------------+  +---------------------+           +---------------+  +-------------------------------+
| Exact Local   |  | Diagnostic Engine   |           | Exact Global  |  | Metadata-Filtered Retriever   |
| Registry      |  | Decision Tree Flow  |           | Instructions  |  | - Filter: audience (cust/tech)|
| Lookup        |  | (AC01 - AC16)       |           | Registry      |  | - Filter: model (exact match) |
| (Sub-millisecond)| (Authoritative Step)|           | (Tier 1/2)    |  | - Filter: appliance_type      |
+---------------+  +---------------------+           +---------------+  | - Hybrid Lexical + Vector     |
        |                  |                                 |          +-------------------------------+
        |                  |                                 |                  |
        +------------------+--------------+------------------+------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |   Phase 3: Safety Guardian Gate       |
                      |   - Blocks 230V, multimeter, PCB, R32 |
                      |     for 'customer' audience           |
                      |   - Flags unverified/conflicted data  |
                      |   - Mandates technician booking when  |
                      |     safety_flag is TRUE               |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |       Verified Client Response        |
                      +---------------------------------------+
```

---

## 3. Detailed Component Plan & Implementation Steps

### Step 1: Namespace Normalization Module (`namespaceNormalizer.ts`)
- `normalizeAcIssueId(raw: string): string | null`: Matches `AC` prefix variations (`AC01`, `AC_01`, `ac-01`, `AC 01`). Rejects any `CH` prefix.
- `normalizeChErrorCode(raw: string): { code: string | null; isAmbiguous: boolean; candidateCodes: string[] }`:
  - Translates spoken words ("zero five" -> "05", "five" -> "05", "thirty eight" -> "38").
  - Identifies ambiguous inputs (e.g. "ch code", "error ch") and flags for user confirmation.
  - Guarantees `AC01` can NEVER match `CH01`.

### Step 2: CH Error Code Coverage Registry (`ch_error_code_registry.json` & `errorCodeRegistry.ts`)
- Covers all 34 known CH codes across both sources.
- Records lookup status, AC03 compatibility, definition source, verification status, conflict flags, and permitted actions.
- Explicitly flags:
  - `CH06`: Unresolved conflict (Fan motor vs Fan/pipe temp sensor).
  - `CH10`: Unresolved conflict (Drain level vs Indoor blower lock).
  - Unverified AC03-only codes: `CH09`, `CH12`, `CH35`, `CH38`, `CH41`, `CH61`, `CH62`.
  - Lookup-only codes: `CH03`, `CH04`, `CH07`, `CH08`, `CH13`, `CH24`, `CH33`, `CH40`, `CH65`, `CH97` (returns verified customer action, does NOT fabricate a tree flow).

### Step 3: Global Instruction Registry (`global_instructions.json` & `instructionResolver.ts`)
- Maps all 22 action IDs found across the 16 decision trees (`instruct_clean_dry_filter`, `instruct_hard_reset_mcb`, `instruct_clear_outdoor_airflow`, etc.).
- Schema: `id`, `text`, `text_hi`, `appliance_type`, `model`, `audience`, `source`, `verification_status`, `safety_flag`, `steps`.
- 4-Tier Resolution Pipeline:
  1. Exact instruction lookup.
  2. Cache hit (model- and audience-specific).
  3. Model-filtered RAG fallback.
  4. Safe clarification/escalation.

### Step 4: Metadata-Filtered Hybrid Knowledge Retriever (`retrievalService.ts`)
- Ingests and chunks `manual_disassembly_maintenance.txt`, `manual_electrical_specs.txt`, `troubleshooting_error_codes.txt`, and `warranty_policy_rules.txt`.
- Metadata schema: `chunk_id`, `appliance_type`, `model`, `source`, `section`, `audience` (`customer` | `technician`), `verification_status`, `document_type`.
- Enforces:
  - Exact model matching (`UW-Q18WUZA`, `MS-Q18YNZA` or `ALL`). Never matches general guidance as model-verified.
  - Audience gating: customer requests cannot retrieve `audience: 'technician'` chunks.
  - Configurable `topK` and `similarityThreshold`.
  - In-process lexical + vector score calculations.
  - Detailed latency benchmarking.

### Step 5: Deterministic Router (`deterministicRouter.ts`)
- Classifies requests into the 6 designated categories.
- Routes deterministic queries directly to exact registries without touching vector search.
- Binds to `chatService.ts` to maintain decision tree state authority.

### Step 6: Decision Tree Graph Validator (`treeValidator.ts`)
- Graph analysis tool testing all 16 trees.
- Validates node transitions, action IDs, conclusions, and error code references.

### Step 7: Automated Test Suite (`audit-test-runner.ts`)
- Automates all 14 required audit test cases.
- Measures and reports lookup, vector, and end-to-end latencies.

---

## 4. Deliverables Checklist
- [x] Plan documented in `HYBRID_RETRIEVAL_PLAN.md`
- [ ] Create `backend/src/engine/namespaceNormalizer.ts`
- [ ] Create `backend/src/data/ch_error_code_registry.json` and `backend/src/data/errorCodeRegistry.ts`
- [ ] Create `backend/src/data/global_instructions.json` and `backend/src/engine/instructionResolver.ts`
- [ ] Create `backend/src/engine/retrievalService.ts`
- [ ] Create `backend/src/engine/deterministicRouter.ts`
- [ ] Create `backend/src/engine/treeValidator.ts`
- [ ] Update `backend/src/engine/chatService.ts` and `backend/src/data/store.ts`
- [ ] Create and run `backend/src/scripts/audit-test-runner.ts`
- [ ] Document latency benchmarks, conflicts, and final report.
