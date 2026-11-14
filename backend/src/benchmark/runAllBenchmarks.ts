/**
 * ApplianceCare AI — Master Voice Agent Benchmark Orchestrator
 *
 * Runs the complete 1,050-case benchmark across all 10 metric categories,
 * evaluates Tri-Scorecards, and exports executive dashboard metrics.
 */

import { BenchmarkDataset } from './data/datasetGenerator';
import { VoiceQualityRunner } from './runners/voiceQualityRunner';
import { DiagnosticRunner } from './runners/diagnosticRunner';
import { WorkflowRunner } from './runners/workflowRunner';
import { MetricsEngine } from './metricsEngine';
import { ScorecardFormatter } from './scorecards/scorecardFormatter';
import { ScorecardExporter } from './scorecards/scorecardExporter';
import { BenchmarkTurnResult } from './types';

async function runBenchmarkSuite() {
  const startTime = Date.now();
  console.log('Loading 1,050 ground-truth benchmark evaluation dataset...');
  const dataset = BenchmarkDataset.getDataset();
  console.log(`Loaded ${dataset.length} test cases across 9 partitions.\n`);

  // Partition cases
  const voiceCases = dataset.filter(
    (tc) => tc.category === 'audio_and_noise' || tc.category === 'interruptions'
  );
  const diagCases = dataset.filter(
    (tc) =>
      tc.category === 'asr_and_entities' ||
      tc.category === 'intent_routing' ||
      tc.category === 'diagnostic_decision_trees' ||
      tc.category === 'rag_and_grounding' ||
      tc.category === 'safety' ||
      tc.category === 'multilingual'
  );
  const workflowCases = dataset.filter((tc) => tc.category === 'booking_and_workflow');

  console.log(`Running Voice Quality & Latency Benchmark (${voiceCases.length} cases)...`);
  const voiceResults = await VoiceQualityRunner.runCases(voiceCases);

  console.log(`Running Diagnostic Intelligence & Safety Benchmark (${diagCases.length} cases)...`);
  const diagResults = await DiagnosticRunner.runCases(diagCases);

  console.log(`Running Workflow & Business Reliability Benchmark (${workflowCases.length} cases)...`);
  const workflowResults = await WorkflowRunner.runCases(workflowCases);

  const allResults: BenchmarkTurnResult[] = [
    ...voiceResults,
    ...diagResults,
    ...workflowResults,
  ];

  const durationMs = Date.now() - startTime;
  console.log(`\nAggregating telemetry and compiling metrics distributions across ${allResults.length} cases...`);
  const report = MetricsEngine.compileReport(allResults, dataset.length, durationMs);

  // Output Dashboard
  const dashboard = ScorecardFormatter.formatTerminalDashboard(report);
  console.log('\n' + dashboard + '\n');

  // Export report
  const exportedPath = ScorecardExporter.exportToJson(report);
  console.log(`✅ Benchmark report exported successfully to: ${exportedPath}\n`);

  // Ensure critical safety compliance: 0 unsafe instructions allowed
  if (report.diagnosticIntelligence.unsafeInstructionCount > 0) {
    console.error('❌ SAFETY FAILURE: Unsafe instructions detected in safety test cases!');
    process.exit(1);
  }

  process.exit(0);
}

runBenchmarkSuite().catch((err) => {
  console.error('Fatal error during benchmark suite execution:', err);
  process.exit(1);
});

