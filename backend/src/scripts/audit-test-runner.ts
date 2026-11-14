/**
 * ApplianceCare AI — Automated Hybrid Retrieval & Diagnostic Routing Audit Test Runner
 *
 * Verifies all 14 mandatory test cases:
 * 1. AC01 and AC_01 resolve to the same internal issue.
 * 2. CH05 and CH 05 resolve to the same displayed error code.
 * 3. AC01 can never be mistaken for CH01.
 * 4. A known CH code is retrieved locally without an unnecessary vector search.
 * 5. An unknown CH code does not produce an invented diagnosis.
 * 6. An unresolved CH06 or CH10 conflict is flagged.
 * 7. A CH code with no supported troubleshooting flow does not trigger a fabricated flow.
 * 8. Every diagnostic action ID is mapped or reported as unresolved.
 * 9. Customer requests cannot retrieve technician-only instructions.
 * 10. Safety-critical branches block unsafe customer instructions.
 * 11. Missing or low-confidence retrieval triggers clarification or escalation.
 * 12. Cache hits return the correct model- and audience-specific result.
 * 13. Incorrect appliance-model metadata cannot silently produce a model-specific answer.
 * 14. Every diagnostic-tree transition points to a valid target.
 *
 * Measures: Local lookup latency, Vector retrieval latency, End-to-end latency.
 */

import { performance } from 'perf_hooks';
import { normalizeAcIssueId, normalizeChErrorCode } from '../engine/namespaceNormalizer';
import { deterministicRouter } from '../engine/deterministicRouter';
import { errorCodeRegistry } from '../data/errorCodeRegistry';
import { instructionResolver } from '../engine/instructionResolver';
import { retrievalService } from '../engine/retrievalService';
import { validateAllDiagnosticTrees } from '../engine/treeValidator';
import { getTree } from '../data/store';

interface TestCaseResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
  latencyMs: number;
}

const results: TestCaseResult[] = [];

function runTest(id: number, name: string, fn: () => { passed: boolean; details: string }) {
  const start = performance.now();
  try {
    const res = fn();
    const duration = performance.now() - start;
    results.push({
      id,
      name,
      passed: res.passed,
      details: res.details,
      latencyMs: Number(duration.toFixed(2)),
    });
  } catch (err: any) {
    const duration = performance.now() - start;
    results.push({
      id,
      name,
      passed: false,
      details: `Exception: ${err.message}`,
      latencyMs: Number(duration.toFixed(2)),
    });
  }
}

console.log('======================================================================');
console.log('   ApplianceCare AI — Hybrid Retrieval & Routing Audit Test Suite     ');
console.log('======================================================================\n');

// ── Test 1: AC01 and AC_01 resolve to the same internal issue ───────────────
runTest(1, 'AC01 and AC_01 resolve to the same internal issue', () => {
  const c1 = normalizeAcIssueId('AC01');
  const c2 = normalizeAcIssueId('AC_01');
  const c3 = normalizeAcIssueId('ac-01');
  const c4 = normalizeAcIssueId('ac 01');

  const allEqual = c1 === 'AC01' && c2 === 'AC01' && c3 === 'AC01' && c4 === 'AC01';
  return {
    passed: allEqual,
    details: `Outputs: AC01->${c1}, AC_01->${c2}, ac-01->${c3}, ac 01->${c4}`,
  };
});

// ── Test 2: CH05 and CH 05 resolve to the same displayed error code ──────────
runTest(2, 'CH05 and CH 05 resolve to the same displayed error code', () => {
  const r1 = normalizeChErrorCode('CH05');
  const r2 = normalizeChErrorCode('CH 05');
  const r3 = normalizeChErrorCode('ch zero five');
  const r4 = normalizeChErrorCode('c h 5');

  const allMatch = r1.code === 'CH05' && r2.code === 'CH05' && r3.code === 'CH05' && r4.code === 'CH05';
  return {
    passed: allMatch,
    details: `Normalized codes: "CH05"->${r1.code}, "CH 05"->${r2.code}, "ch zero five"->${r3.code}, "c h 5"->${r4.code}`,
  };
});

// ── Test 3: AC01 can never be mistaken for CH01 ──────────────────────────────
runTest(3, 'AC01 can never be mistaken for CH01', () => {
  const acAsCh = normalizeChErrorCode('AC01');
  const chAsAc = normalizeAcIssueId('CH01');

  const acSeparated = acAsCh.code === null;
  const chSeparated = chAsAc === null;

  return {
    passed: acSeparated && chSeparated,
    details: `normalizeChErrorCode('AC01')->${acAsCh.code ?? 'null'} | normalizeAcIssueId('CH01')->${chAsAc ?? 'null'}`,
  };
});

// ── Test 4: Known CH code is retrieved locally without unnecessary vector search
runTest(4, 'Known CH code is retrieved locally without unnecessary vector search', () => {
  const t0 = performance.now();
  const route = deterministicRouter.route('CH 05', { model: 'UW-Q18WUZA', audience: 'customer' });
  const latency = performance.now() - t0;

  const passed =
    route.route === 'EXPLICIT_ERROR_CODE' &&
    route.targetId === 'CH05' &&
    route.chResult?.entry !== null &&
    route.retrievalTelemetry === undefined; // Did NOT trigger vector retrieval

  return {
    passed,
    details: `Route: ${route.route}, Target: ${route.targetId}, VectorSearchBypassed: ${route.retrievalTelemetry === undefined}, Latency: ${latency.toFixed(3)}ms`,
  };
});

// ── Test 5: Unknown CH code does not produce an invented diagnosis ───────────
runTest(5, 'Unknown CH code does not produce an invented diagnosis', () => {
  const route = deterministicRouter.route('CH 99', { model: 'UW-Q18WUZA', audience: 'customer' });

  const passed =
    route.route === 'EXPLICIT_ERROR_CODE' &&
    route.chResult?.entry === undefined &&
    route.responseText.includes('not listed in the verified LG Dual Inverter database');

  return {
    passed,
    details: `Response indicates unverified/unlisted without fabricating causes: "${route.responseText.slice(0, 80)}..."`,
  };
});

// ── Test 6: Unresolved CH06 or CH10 conflict is flagged ──────────────────────
runTest(6, 'Unresolved CH06 or CH10 conflict is flagged', () => {
  const entry06 = errorCodeRegistry.getEntry('CH06');
  const entry10 = errorCodeRegistry.getEntry('CH10');

  const is06Conflict = entry06?.verification_status === 'unresolved_conflict' && entry06.conflict_details?.conflict === true;
  const is10Conflict = entry10?.verification_status === 'unresolved_conflict' && entry10.conflict_details?.conflict === true;

  const formatted06 = entry06 ? errorCodeRegistry.formatResponse(entry06) : null;
  const formatted10 = entry10 ? errorCodeRegistry.formatResponse(entry10) : null;

  const passed =
    is06Conflict &&
    is10Conflict &&
    formatted06?.hasConflict === true &&
    formatted10?.hasConflict === true &&
    formatted06.canStartInteractiveFlow === false;

  return {
    passed,
    details: `CH06 status: ${entry06?.verification_status}, CH10 status: ${entry10?.verification_status}, Notice attached: ${!!formatted06?.conflictNotice}`,
  };
});

// ── Test 7: CH code with no supported troubleshooting flow does not trigger a fabricated flow
runTest(7, 'CH code with no supported troubleshooting flow does not trigger fabricated flow', () => {
  // CH04 is in lookup only, has no flow in AC03
  const entry04 = errorCodeRegistry.getEntry('CH04');
  const formatted04 = entry04 ? errorCodeRegistry.formatResponse(entry04) : null;

  const passed =
    entry04 !== null &&
    entry04.compatible_diagnostic_flow === null &&
    formatted04?.canStartInteractiveFlow === false &&
    formatted04.compatibleFlowId === null;

  return {
    passed,
    details: `CH04 compatible_flow: ${entry04?.compatible_diagnostic_flow}, canStartInteractive: ${formatted04?.canStartInteractiveFlow}`,
  };
});

// ── Test 8: Every diagnostic action ID is mapped or reported as unresolved ───
runTest(8, 'Every diagnostic action ID is mapped or reported as unresolved', () => {
  const treeAudit = validateAllDiagnosticTrees();

  const allMapped = treeAudit.unmappedActions.length === 0;
  return {
    passed: allMapped,
    details: `Total actions audited: ${treeAudit.totalActionsAudited}, Unmapped action IDs: ${treeAudit.unmappedActions.join(', ') || 'None (100% mapped)'}`,
  };
});

// ── Test 9: Customer requests cannot retrieve technician-only instructions ───
runTest(9, 'Customer requests cannot retrieve technician-only instructions', () => {
  // Customer querying for multimeter electrical diagnostics
  const res = deterministicRouter.route('How to measure compressor terminal resistance with a multimeter', {
    audience: 'customer',
  });

  const passed =
    res.safetyAlert === true &&
    res.responseText.includes('Safety Warning') &&
    res.responseText.includes('Lethal Voltage');

  return {
    passed,
    details: `Customer query blocked with Safety Warning: ${res.safetyAlert}, Text: "${res.responseText.slice(0, 90)}..."`,
  };
});

// ── Test 10: Safety-critical branches block unsafe customer instructions ─────
runTest(10, 'Safety-critical branches block unsafe customer instructions', () => {
  const res = deterministicRouter.route('There are sparks and smoke coming from the outdoor AC unit', {
    audience: 'customer',
  });

  const passed =
    res.safetyAlert === true &&
    res.targetId === 'AC16' &&
    res.responseText.includes('CRITICAL SAFETY EMERGENCY');

  return {
    passed,
    details: `Immediate power shutdown mandated: targetId=${res.targetId}, safetyAlert=${res.safetyAlert}`,
  };
});

// ── Test 11: Missing or low-confidence retrieval triggers clarification or escalation
runTest(11, 'Missing or low-confidence retrieval triggers clarification or escalation', () => {
  // Query with ambiguous speech mention
  const res = deterministicRouter.route('I think the display has a ch code on it', {
    audience: 'customer',
  });

  const passed =
    res.route === 'EXPLICIT_ERROR_CODE' &&
    res.chResult?.isAmbiguous === true &&
    res.chResult.disambiguationPrompt !== undefined;

  return {
    passed,
    details: `Ambiguity caught: prompt="${res.chResult?.disambiguationPrompt?.slice(0, 80)}..."`,
  };
});

// ── Test 12: Cache hits return the correct model- and audience-specific result ─
runTest(12, 'Cache hits return correct model- and audience-specific result', () => {
  instructionResolver.clearCache();

  // First call: Tier 1 exact mapping
  const call1 = instructionResolver.resolve('instruct_clean_dry_filter', 'UW-Q18WUZA', 'customer');
  // Second call: Tier 2 cache hit
  const call2 = instructionResolver.resolve('instruct_clean_dry_filter', 'UW-Q18WUZA', 'customer');

  const passed =
    call1.sourceTier === 'exact_mapping' &&
    call2.sourceTier === 'cache' &&
    call2.instruction?.id === 'instruct_clean_dry_filter' &&
    call2.instruction.model === 'UW-Q18WUZA' &&
    call2.instruction.audience === 'customer';

  return {
    passed,
    details: `Call 1 tier: ${call1.sourceTier}, Call 2 tier: ${call2.sourceTier}, Model: ${call2.instruction?.model}`,
  };
});

// ── Test 13: Incorrect appliance-model metadata cannot silently produce model-specific answer
runTest(13, 'Incorrect appliance-model metadata cannot silently produce model-specific answer', () => {
  // Retrieve for a completely non-existent / mismatched model
  const telemetry = retrievalService.retrieve('What is the recommended circuit breaker amperage?', {
    appliance_type: 'air-conditioner',
    model: 'NON-EXISTENT-MODEL-XYZ-999',
    audience: 'customer',
  });

  const passed = telemetry.retrievedCount === 0;
  return {
    passed,
    details: `Mismatched model retrieved chunks count: ${telemetry.retrievedCount} (Strict model filter enforced)`,
  };
});

// ── Test 14: Every diagnostic-tree transition points to a valid target ────────
runTest(14, 'Every diagnostic-tree transition points to a valid target', () => {
  const treeAudit = validateAllDiagnosticTrees();

  const brokenTransitions = treeAudit.errors.filter((e) => e.type === 'BROKEN_NEXT_NODE');
  const missingConclusions = treeAudit.errors.filter((e) => e.type === 'MISSING_CONCLUSION');
  const invalidRedirects = treeAudit.errors.filter((e) => e.type === 'INVALID_REDIRECT');

  const passed = brokenTransitions.length === 0 && missingConclusions.length === 0 && invalidRedirects.length === 0;

  return {
    passed,
    details: `Trees audited: ${treeAudit.totalTreesAudited}, Nodes: ${treeAudit.totalNodesAudited}, Options: ${treeAudit.totalOptionsAudited}, Broken transitions: ${brokenTransitions.length}, Missing conclusions: ${missingConclusions.length}`,
  };
});

// ── Test 15: Lexical and vector retrieval are fused correctly ─────────────────
runTest(15, 'Lexical and vector retrieval are fused correctly via RRF and weighted modes', () => {
  const query = 'clean air filter and indoor grille maintenance';

  // Test 1: RRF Fusion
  const rrfTelemetry = retrievalService.retrieve(query, {
    model: 'UW-Q18WUZA',
    audience: 'customer',
    fusionStrategy: 'rrf',
    fusionK: 60,
  });

  // Test 2: Weighted Fusion
  const weightedTelemetry = retrievalService.retrieve(query, {
    model: 'UW-Q18WUZA',
    audience: 'customer',
    fusionStrategy: 'weighted',
    lexicalWeight: 0.6,
  });

  const passed =
    rrfTelemetry.fusionStrategyUsed === 'rrf' &&
    rrfTelemetry.results.length > 0 &&
    rrfTelemetry.results[0].lexicalRank !== undefined &&
    rrfTelemetry.results[0].vectorRank !== undefined &&
    weightedTelemetry.fusionStrategyUsed === 'weighted' &&
    weightedTelemetry.results.length > 0 &&
    weightedTelemetry.results[0].hybridScore > 0;

  return {
    passed,
    details: `RRF top score: ${rrfTelemetry.results[0]?.hybridScore.toFixed(4)} (rank_lex=${rrfTelemetry.results[0]?.lexicalRank}, rank_vec=${rrfTelemetry.results[0]?.vectorRank}), Weighted top score: ${weightedTelemetry.results[0]?.hybridScore.toFixed(4)}`,
  };
});

// ── Test 16: Source provenance and verification status survive through response generation
runTest(16, 'Source provenance and verification status survive through response generation', () => {
  // Test error code resolution evidence
  const errRes = deterministicRouter.route('CH 05 on display', {
    model: 'UW-Q18WUZA',
    audience: 'customer',
  });

  // Test warranty RAG resolution evidence
  const warRes = deterministicRouter.route('What is the warranty period for the compressor?', {
    model: 'UW-Q18WUZA',
    audience: 'customer',
  });

  const errEvidenceValid =
    errRes.evidence &&
    errRes.evidence.intent === 'EXPLICIT_ERROR_CODE' &&
    errRes.evidence.evidenceItems.length > 0 &&
    errRes.evidence.evidenceItems[0].sourceId === 'lg_ac_error_codes.json' &&
    errRes.evidence.evidenceItems[0].verificationStatus === 'verified';

  const warEvidenceValid =
    warRes.evidence &&
    warRes.evidence.intent === 'WARRANTY_POLICY' &&
    warRes.evidence.evidenceItems.length > 0 &&
    warRes.evidence.evidenceItems[0].documentType === 'warranty' &&
    warRes.evidence.evidenceItems[0].verificationStatus === 'policy_pending';

  const passed = !!(errEvidenceValid && warEvidenceValid);

  return {
    passed,
    details: `Error code source="${errRes.evidence?.evidenceItems[0]?.sourceId}" [status=${errRes.evidence?.evidenceItems[0]?.verificationStatus}], Warranty source="${warRes.evidence?.evidenceItems[0]?.sourceId}" [status=${warRes.evidence?.evidenceItems[0]?.verificationStatus}]`,
  };
});

// ── Latency Benchmarking (7 Granular System Layers) ─────────────────────────
console.log('----------------------------------------------------------------------');
console.log('   LATENCY PERFORMANCE BENCHMARK (100-Iteration Granular Sampling)    ');
console.log('----------------------------------------------------------------------');

const ITERATIONS = 100;

// Layer 1: Local JSON Error Code Lookup
const tLookupStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  errorCodeRegistry.getEntry('CH05');
}
const avgLocalLookupMs = (performance.now() - tLookupStart) / ITERATIONS;

// Layer 2: Decision Tree Transition
const tTreeStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const tree = getTree ? getTree('AC01') : null;
}
const avgTreeTransitionMs = (performance.now() - tTreeStart) / ITERATIONS;

// Layer 3: Cache Lookup Latency
instructionResolver.resolve('instruct_clean_dry_filter', 'UW-Q18WUZA', 'customer');
const tCacheStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  instructionResolver.resolve('instruct_clean_dry_filter', 'UW-Q18WUZA', 'customer');
}
const avgCacheLookupMs = (performance.now() - tCacheStart) / ITERATIONS;

// Layer 4 & 5 & 6: Lexical, Vector, and Fusion Latencies from Telemetry
const telemetrySample = retrievalService.retrieve('warranty policy compressor replacement', {
  model: 'UW-Q18WUZA',
  audience: 'customer',
  fusionStrategy: 'rrf',
});

// Layer 7: End-to-End Chat Routing & Triage
const tE2EStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  deterministicRouter.route('My AC is blowing warm air and not cooling properly', {
    model: 'UW-Q18WUZA',
    audience: 'customer',
  });
}
const avgE2EMs = (performance.now() - tE2EStart) / ITERATIONS;

console.log(`1. Local JSON Lookup Latency:         ${avgLocalLookupMs.toFixed(4)} ms`);
console.log(`2. Decision Tree Load Latency:        ${avgTreeTransitionMs.toFixed(4)} ms`);
console.log(`3. Instruction Cache Lookup Latency:  ${avgCacheLookupMs.toFixed(4)} ms`);
console.log(`4. Lexical Retrieval Latency:         ${telemetrySample.lexicalRetrievalLatencyMs.toFixed(4)} ms`);
console.log(`5. Vector Retrieval Latency:          ${telemetrySample.vectorRetrievalLatencyMs.toFixed(4)} ms`);
console.log(`6. Fusion & Reranking Latency:        ${telemetrySample.fusionLatencyMs.toFixed(4)} ms`);
console.log(`7. End-to-End Router Latency:         ${avgE2EMs.toFixed(4)} ms\n`);

// ── Summary Report ──────────────────────────────────────────────────────────
console.log('----------------------------------------------------------------------');
console.log('   AUDIT TEST RESULTS SUMMARY                                         ');
console.log('----------------------------------------------------------------------');

let passedCount = 0;
for (const r of results) {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  if (r.passed) passedCount++;
  console.log(`Test ${String(r.id).padStart(2, '0')}: [${status}] ${r.name} (${r.latencyMs} ms)`);
  console.log(`         Details: ${r.details}\n`);
}

console.log('======================================================================');
console.log(`TOTAL: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}%)`);
console.log('======================================================================\n');

if (passedCount < results.length) {
  process.exit(1);
} else {
  process.exit(0);
}
