/**
 * Lightweight Local Intent Classification Engine ("Laya/Jev" Alternative)
 * 3-Tier Classifier:
 * Level 1: Regex & Pattern Matcher (< 5ms)
 * Level 2: Naive Bayes NLP Classifier trained on 16 issue trees (EN + HI) (< 25ms)
 * Level 3: Fallback Triage (< 50ms)
 */

// @ts-ignore
import natural from 'natural';
import { getAllTrees, findErrorCode } from '../data/store';

export interface IntentResult {
  type: 'ERROR_CODE' | 'CRITICAL_SAFETY' | 'SYMPTOM_TREE' | 'WARRANTY' | 'MAINTENANCE' | 'AGENTIC_TRIAGE';
  target?: string;
  confidence: number;
  label?: string;
  reason: string;
  suggestedAction?: string;
}

class LocalIntentClassifier {
  private classifier: any;
  private isTrained: boolean = false;

  constructor() {
    this.classifier = new natural.BayesClassifier();
  }

  public train(): void {
    if (this.isTrained) return;

    try {
      const trees = getAllTrees();
      trees.forEach((tree) => {
        // Train on issue ID and title
        this.classifier.addDocument(tree.title.toLowerCase(), tree.issue_id);

        // Train on node questions (English and Hindi)
        tree.nodes.forEach((node) => {
          if (node.text_en) {
            this.classifier.addDocument(node.text_en.toLowerCase(), tree.issue_id);
          }
          if (node.text_hi) {
            this.classifier.addDocument(node.text_hi.toLowerCase(), tree.issue_id);
          }
          node.options.forEach((opt) => {
            if (opt.label) {
              this.classifier.addDocument(opt.label.toLowerCase(), tree.issue_id);
            }
          });
        });
      });

      // Domain-specific colloquial synonym documents
      const domainTerms: Array<{ text: string; issueId: string }> = [
        { text: 'not cooling warm air hot room cooling slow cooling low thanda nahi', issueId: 'AC01' },
        { text: 'ac not turning on no power dead switch off display blank start nahi', issueId: 'AC02' },
        { text: 'mcb tripping fuse blown spark circuit breaker trip power cut', issueId: 'AC03' },
        { text: 'water leaking dripping indoor unit drop pani tapak water falling', issueId: 'AC04' },
        { text: 'bad smell foul odor burning plastic rotten egg musty bad air', issueId: 'AC05' },
        { text: 'unusual noise loud vibrating rattling squeaking humming fan sound awaz', issueId: 'AC06' },
        { text: 'weak airflow louvers stuck fan speed slow air not blowing hava', issueId: 'AC07' },
        { text: 'remote not working buttons dead battery change signal light', issueId: 'AC08' },
        { text: 'ice on coils frost copper pipe freezing barf jam coil white', issueId: 'AC09' },
        { text: 'compressor cutting off cycling frequent stop start clicking sound', issueId: 'AC10' },
        { text: 'display blinking lights error digits flashing light flicker', issueId: 'AC11' },
        { text: 'filter dirty clean jali wash filter alert indicator mesh cleaning', issueId: 'AC12' },
        { text: 'sensor error thermistor room temperature wrong reading ch01 ch02', issueId: 'AC13' },
        { text: 'front grill broken loose cabinet damaged vibration body damage', issueId: 'AC14' },
        { text: 'installation tilt improper window gap slope leakage wall frame', issueId: 'AC15' },
        { text: 'hardware failure pcb burnt motor replaced need technician visit', issueId: 'AC16' },
      ];

      domainTerms.forEach((dt) => {
        this.classifier.addDocument(dt.text, dt.issueId);
      });

      this.classifier.train();
      this.isTrained = true;
      console.log('✅ [IntentEngine] Level-2 Naive Bayes Classifier trained successfully on 16 issue trees.');
    } catch (err: any) {
      console.warn('⚠️ [IntentEngine] Classifier training encountered warning:', err.message);
    }
  }

  public classify(input: string): IntentResult {
    const raw = (input || '').trim();
    const text = raw.toLowerCase();

    if (!text) {
      return {
        type: 'AGENTIC_TRIAGE',
        confidence: 0.1,
        reason: 'Empty query received',
      };
    }

    // ── LEVEL 1A: Critical Safety & Hazard Keywords (< 5ms) ──
    if (/(smoke|spark|fire|burning\s?smell|electric\s?shock|blast|flame|shock\s?lag raha)/i.test(text)) {
      return {
        type: 'CRITICAL_SAFETY',
        target: 'AC03',
        confidence: 1.0,
        label: 'Immediate Electrical Safety Hazard',
        reason: 'Critical safety keywords detected (fire/smoke/shock risk). Disconnect mains immediately.',
        suggestedAction: 'TRIP_MCB_AND_BOOK_EMERGENCY',
      };
    }

    // ── LEVEL 1B: Exact Error Code Match (< 5ms) ──
    const codeMatch = text.match(/\b(ch\s?\d{1,2}|cl|fl|hl|po|lo|hi|od|e\d)\b/i);
    if (codeMatch) {
      const codeRecord = findErrorCode(codeMatch[0]);
      if (codeRecord) {
        return {
          type: 'ERROR_CODE',
          target: codeRecord.code,
          confidence: 0.99,
          label: `Error Code ${codeRecord.code}: ${codeRecord.description}`,
          reason: `Exact match for official LG error code ${codeRecord.code}.`,
          suggestedAction: 'NAVIGATE_TO_ERROR_CODE',
        };
      }
    }

    // ── LEVEL 1C: Specific Intent Patterns (< 5ms) ──
    if (/(warranty|guarantee|invoice|bill|compressor\s?coverage|amc)/i.test(text)) {
      return {
        type: 'WARRANTY',
        confidence: 0.95,
        label: 'Warranty Coverage & Verification',
        reason: 'User inquiry relates to warranty terms or compressor coverage.',
        suggestedAction: 'NAVIGATE_TO_WARRANTY',
      };
    }

    if (/(how\s?to\s?clean|filter\s?wash|condenser\s?fin|drain\s?pipe\s?clean|maintenance\s?schedule)/i.test(text)) {
      return {
        type: 'MAINTENANCE',
        confidence: 0.92,
        label: 'Preventive Maintenance & Cleaning',
        reason: 'User inquiry relates to filter cleaning or outdoor maintenance.',
        suggestedAction: 'NAVIGATE_TO_MAINTENANCE',
      };
    }

    // ── LEVEL 2: Naive Bayes Multi-Class Classifier (< 25ms) ──
    if (this.isTrained) {
      try {
        const classifications = this.classifier.getClassifications(text);
        if (classifications && classifications.length > 0) {
          const top = classifications[0];
          // Normalized threshold:
          if (top.value > 0.0001) {
            const trees = getAllTrees();
            const matchedTree = trees.get(top.label);
            return {
              type: 'SYMPTOM_TREE',
              target: top.label,
              confidence: Math.min(0.92, Number((top.value * 100).toFixed(2)) || 0.85),
              label: matchedTree?.title || `Issue ${top.label}`,
              reason: `Lightweight NLP matched symptoms to category ${top.label} (${matchedTree?.title || ''}).`,
              suggestedAction: 'LAUNCH_DIAGNOSTIC_TREE',
            };
          }
        }
      } catch (err: any) {
        console.warn('NLP classifier error:', err.message);
      }
    }

    // ── LEVEL 3: Fallback to General Triage ──
    return {
      type: 'AGENTIC_TRIAGE',
      target: 'AC01',
      confidence: 0.5,
      label: 'General Diagnostic Triage',
      reason: 'Natural query received with conversational nuances; defaulting to interactive triage hub.',
      suggestedAction: 'OPEN_TRIAGE_WIZARD',
    };
  }
}

export const intentEngine = new LocalIntentClassifier();
