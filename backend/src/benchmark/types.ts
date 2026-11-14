/**
 * ApplianceCare AI — Benchmark Types & Metrics Definitions
 *
 * Implements data structures for the 10 metric categories,
 * 1,050-case evaluation dataset, and Tri-Scorecard architecture.
 */

export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'hinglish' | 'tanglish' | 'auto';

export type NoiseCondition = 
  | 'clean'
  | 'ac_indoor_fan'
  | 'outdoor_compressor'
  | 'tv_background'
  | 'distant_speech';

export type TestSuiteCategory =
  | 'audio_and_noise'
  | 'interruptions'
  | 'asr_and_entities'
  | 'intent_routing'
  | 'diagnostic_decision_trees'
  | 'rag_and_grounding'
  | 'safety'
  | 'booking_and_workflow'
  | 'multilingual';

export interface BenchmarkTestCase {
  id: string;
  category: TestSuiteCategory;
  subCategory?: string;
  inputText: string;
  language: LanguageCode;
  noiseCondition: NoiseCondition;
  simulatedSnrDb: number;
  expectedIntent?: string;
  expectedTarget?: string; // e.g. AC01, AC02, CH05, CONFIRM_BOOKING
  expectedEntities?: {
    brand?: string;
    model?: string;
    errorCode?: string;
    symptom?: string;
    slot?: string;
  };
  expectedSafetyViolation?: boolean;
  expectedBargeInTriggered?: boolean;
  interruptionOffsetMs?: number;
  expectedEscalation?: boolean;
  groundedFactsExpected?: string[];
  passCriteria: string;
}

export interface MetricDistribution {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface MetricResult<T = number> {
  name: string;
  category: string;
  value: T;
  target: string;
  passed: boolean;
  unit?: string;
  details?: string;
}

export interface BenchmarkTurnResult {
  testId: string;
  category: TestSuiteCategory;
  subCategory?: string;
  language: LanguageCode;
  noiseCondition: NoiseCondition;
  passed: boolean;
  frtMs?: number;
  bargeInMs?: number;
  asrMs?: number;
  ttsMs?: number;
  totalTurnMs?: number;
  recognizedText?: string;
  wer?: number;
  cer?: number;
  matchedIntent?: string;
  matchedTarget?: string;
  extractedEntities?: Record<string, string>;
  isSafetyCompliant?: boolean;
  isUnsafeInstruction?: boolean;
  isHallucinated?: boolean;
  isGrounded?: boolean;
  bookingSuccess?: boolean;
  contextRetained?: boolean;
  errorMessage?: string;
}

export interface VoiceQualityScorecard {
  firstResponseTime: MetricDistribution;
  bargeInLatency: MetricDistribution;
  asrLatency: MetricDistribution;
  ttsLatency: MetricDistribution;
  totalTurnLatency: MetricDistribution;
  bargeInSuccessRate: number;
  falseBargeInRate: number;
  missedBargeInRate: number;
  vadRecall: number;
  echoLeakageRate: number;
  noiseRobustnessAccuracy: number;
}

export interface DiagnosticIntelligenceScorecard {
  diagnosticAccuracy: number;
  symptomExtractionAccuracy: number;
  workflowCompletionRate: number;
  followUpRelevance: number;
  correctEscalationRate: number;
  unsafeInstructionCount: number;
  safetyDetectionRecall: number;
  ragPrecision: number;
  ragRecall: number;
  hallucinationRate: number;
  entityAccuracy: number;
}

export interface WorkflowReliabilityScorecard {
  ticketCreationSuccessRate: number;
  bookingSuccessRate: number;
  prioritySchedulingCompliance: number;
  duplicateTicketRate: number;
  multiTurnContextRetention: number;
  recoveryAfterFailureRate: number;
  webSocketSuccessRate: number;
}

export interface BenchmarkSuiteReport {
  timestamp: string;
  totalTestCases: number;
  executedCount: number;
  passedCount: number;
  failedCount: number;
  overallPassRate: number;
  durationMs: number;
  voiceQuality: VoiceQualityScorecard;
  diagnosticIntelligence: DiagnosticIntelligenceScorecard;
  workflowReliability: WorkflowReliabilityScorecard;
  slicesByLanguage: Record<string, { total: number; passed: number; passRate: number }>;
  slicesByNoise: Record<string, { total: number; passed: number; passRate: number }>;
  primary15Metrics: Array<MetricResult<any>>;
}
