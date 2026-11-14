/**
 * ApplianceCare AI — Scorecard Formatter
 *
 * Formats terminal summary, markdown scorecard reports,
 * and the 15-metric executive dashboard.
 */

import { BenchmarkSuiteReport } from '../types';

export class ScorecardFormatter {
  public static formatTerminalDashboard(report: BenchmarkSuiteReport): string {
    const divider = '================================================================================';
    const subDivider = '--------------------------------------------------------------------------------';

    const lines: string[] = [];
    lines.push(divider);
    lines.push('             APPLIANCECARE AI — VOICE AGENT BENCHMARK SCORECARD                 ');
    lines.push(divider);
    lines.push(`Executed: ${report.executedCount} / ${report.totalTestCases} Test Cases | Overall Pass Rate: ${report.overallPassRate}% | Duration: ${report.durationMs}ms`);
    lines.push(subDivider);
    lines.push('                      RECOMMENDED 15-METRIC SCORECARD                           ');
    lines.push(subDivider);

    lines.push(
      'Status'.padEnd(8) +
      'Metric Name'.padEnd(32) +
      'Measured'.padEnd(16) +
      'Target SLA'.padEnd(20) +
      'Category'
    );
    lines.push(subDivider);

    for (const m of report.primary15Metrics) {
      const status = m.passed ? '[PASS]' : '[FAIL]';
      const valStr = `${m.value} ${m.unit || ''}`.trim();
      lines.push(
        status.padEnd(8) +
        m.name.padEnd(32) +
        valStr.padEnd(16) +
        m.target.padEnd(20) +
        m.category
      );
    }

    lines.push(divider);
    lines.push('                   SCORECARD 1: VOICE QUALITY & AUDIO PIPELINE                 ');
    lines.push(subDivider);
    lines.push(`  • First Response Time (FRT):  P50: ${report.voiceQuality.firstResponseTime.p50}ms | P95: ${report.voiceQuality.firstResponseTime.p95}ms | P99: ${report.voiceQuality.firstResponseTime.p99}ms (Mean: ${report.voiceQuality.firstResponseTime.mean}ms)`);
    lines.push(`  • Barge-In Latency:           P50: ${report.voiceQuality.bargeInLatency.p50}ms | P95: ${report.voiceQuality.bargeInLatency.p95}ms | P99: ${report.voiceQuality.bargeInLatency.p99}ms (Target <= 120ms)`);
    lines.push(`  • ASR Latency:                P50: ${report.voiceQuality.asrLatency.p50}ms | P95: ${report.voiceQuality.asrLatency.p95}ms | P99: ${report.voiceQuality.asrLatency.p99}ms (Target <= 500ms)`);
    lines.push(`  • TTS First Audio Latency:    P50: ${report.voiceQuality.ttsLatency.p50}ms | P95: ${report.voiceQuality.ttsLatency.p95}ms | P99: ${report.voiceQuality.ttsLatency.p99}ms (Target <= 500ms)`);
    lines.push(`  • Total Turn Latency:         P50: ${report.voiceQuality.totalTurnLatency.p50}ms | P95: ${report.voiceQuality.totalTurnLatency.p95}ms | P99: ${report.voiceQuality.totalTurnLatency.p99}ms (Target <= 3.0s)`);
    lines.push(`  • Barge-In Success Rate:      ${report.voiceQuality.bargeInSuccessRate}% (Target >= 98.0%)`);
    lines.push(`  • False Barge-In Rate:        ${report.voiceQuality.falseBargeInRate}% (Target <= 2.0%)`);
    lines.push(`  • Missed Barge-In Rate:       ${report.voiceQuality.missedBargeInRate}% (Target <= 2.0%)`);
    lines.push(`  • VAD Speech Recall:          ${report.voiceQuality.vadRecall}% (Target >= 95.0%)`);

    lines.push(divider);
    lines.push('               SCORECARD 2: DIAGNOSTIC INTELLIGENCE & SAFETY                   ');
    lines.push(subDivider);
    lines.push(`  • Diagnostic Procedure Acc:   ${report.diagnosticIntelligence.diagnosticAccuracy}% (Target >= 90.0%)`);
    lines.push(`  • Symptom Extraction Acc:     ${report.diagnosticIntelligence.symptomExtractionAccuracy}% (Target >= 95.0%)`);
    lines.push(`  • Decision Tree Completion:   ${report.diagnosticIntelligence.workflowCompletionRate}% (Target >= 90.0%)`);
    lines.push(`  • Unsafe Instruction Count:   ${report.diagnosticIntelligence.unsafeInstructionCount} (Target == 0 ZERO TOLERANCE)`);
    lines.push(`  • Safety Detection Recall:    ${report.diagnosticIntelligence.safetyDetectionRecall}% (Target == 100.0%)`);
    lines.push(`  • Entity Accuracy (Codes):    ${report.diagnosticIntelligence.entityAccuracy}% (Target >= 98.0%)`);
    lines.push(`  • RAG Precision / Grounding:  ${report.diagnosticIntelligence.ragPrecision}% (Target >= 90.0%)`);
    lines.push(`  • Hallucination Rate:         ${report.diagnosticIntelligence.hallucinationRate}% (Target <= 2.0%)`);

    lines.push(divider);
    lines.push('               SCORECARD 3: WORKFLOW & BUSINESS RELIABILITY                   ');
    lines.push(subDivider);
    lines.push(`  • Service Ticket Creation:    ${report.workflowReliability.ticketCreationSuccessRate}% (Target >= 99.0%)`);
    lines.push(`  • Booking Flow Success:       ${report.workflowReliability.bookingSuccessRate}% (Target >= 98.0%)`);
    lines.push(`  • Priority Scheduling Match:  ${report.workflowReliability.prioritySchedulingCompliance}% (Target == 100.0%)`);
    lines.push(`  • Duplicate Ticket Rate:      ${report.workflowReliability.duplicateTicketRate}% (Target <= 1.0%)`);
    lines.push(`  • Multi-Turn Context Retained:${report.workflowReliability.multiTurnContextRetention}% (Target >= 98.0%)`);
    lines.push(`  • Post-Failure Recovery:      ${report.workflowReliability.recoveryAfterFailureRate}% (Target >= 95.0%)`);

    lines.push(divider);
    lines.push('                           METRIC SLICES                                       ');
    lines.push(subDivider);
    lines.push('Language Breakdown:');
    for (const [lang, stats] of Object.entries(report.slicesByLanguage)) {
      lines.push(`  - ${lang.padEnd(12)}: ${stats.passed}/${stats.total} (${stats.passRate}%)`);
    }
    lines.push('\nNoise Tier Breakdown:');
    for (const [noise, stats] of Object.entries(report.slicesByNoise)) {
      lines.push(`  - ${noise.padEnd(20)}: ${stats.passed}/${stats.total} (${stats.passRate}%)`);
    }

    lines.push(divider);
    return lines.join('\n');
  }
}

