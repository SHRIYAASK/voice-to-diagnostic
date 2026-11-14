/**
 * LAYA Lightweight Local Intent Classification Engine (Node.js)
 * High-performance 3-Tier Classifier with ZERO external API dependencies.
 * 
 * - Tier 1: Regex & Lexical Matcher (< 5ms) -> Explicit error codes & immediate hazards
 * - Tier 2: Bilingual Naive Bayes Classifier (< 25ms) -> Trained on EN + HI + Hinglish
 * - Tier 3: Fallback Triage (< 50ms) -> Confidence < 0.70 routes to AC16 Triage Tree
 */

// @ts-ignore
import natural from 'natural';
import { getAllTrees, findErrorCode, getTree } from '../data/store';

export interface ExtractedEntities {
  errorCode?: string;
  safetyHazard?: string;
  symptomPhrase?: string;
  language?: 'en' | 'hi' | 'hinglish';
  matchedNodeId?: string;
}

export interface LayaClassificationResult {
  intent_type: 'ERROR_CODE' | 'CRITICAL_SAFETY' | 'SYMPTOM_TREE' | 'TRIAGE_FALLBACK' | 'WARRANTY' | 'MAINTENANCE' | 'UNKNOWN';
  target_tree_id: string;
  confidence: number;
  extracted_entities: ExtractedEntities;
}

export class LayaIntentClassifier {
  private classifier: any;
  private isTrained: boolean = false;
  private trainingTimestamp: number = 0;
  private vocabulary: Set<string> = new Set();

  constructor() {
    this.classifier = new natural.BayesClassifier();
    this.train();
  }

  private addDoc(text: string, label: string) {
    if (!text || !label) return;
    const clean = text.toLowerCase().trim();
    this.classifier.addDocument(clean, label);
    clean.split(/[^a-zA-Z0-9\u0900-\u097F]+/).forEach((w) => {
      if (w.length > 1) this.vocabulary.add(w);
    });
  }

  /**
   * Train the Naive Bayes classifier on all 16 issue trees from combined JSON
   * including English and Hindi question texts, option labels, and domain synonyms.
   */
  public train(): void {
    if (this.isTrained) return;

    try {
      const trees = getAllTrees();

      trees.forEach((tree) => {
        const issueId = tree.issue_id;

        // 1. Train on Title & Issue ID
        this.addDoc(tree.title.toLowerCase(), issueId);
        this.addDoc(issueId.toLowerCase(), issueId);

        // 2. Train on ALL Nodes: text_en, text_hi, and option labels
        tree.nodes.forEach((node) => {
          if (node.text_en) {
            this.addDoc(node.text_en.toLowerCase(), issueId);
          }
          if (node.text_hi) {
            this.addDoc(node.text_hi.toLowerCase(), issueId);
          }
          if (Array.isArray(node.options)) {
            node.options.forEach((opt) => {
              if (opt.label) {
                this.addDoc(opt.label.toLowerCase(), issueId);
              }
            });
          }
        });
      });

      // 3. Domain-specific Hinglish Colloquial Synonyms & Customer Phrasings (Discrete phrases for high TF-IDF weighting)
      const discretePhrases: Array<{ phrase: string; issueId: string }> = [
        // AC01: Cooling Performance / Not Cooling
        { phrase: 'thanda nahi ho raha', issueId: 'AC01' },
        { phrase: 'kamre me thanda nahi ho raha hai', issueId: 'AC01' },
        { phrase: 'room thanda nahi ho raha', issueId: 'AC01' },
        { phrase: 'cooling nahi ho rahi', issueId: 'AC01' },
        { phrase: 'garam hawa de raha hai', issueId: 'AC01' },
        { phrase: 'ac is not cooling', issueId: 'AC01' },
        { phrase: 'not cooling properly', issueId: 'AC01' },
        { phrase: 'blowing warm air', issueId: 'AC01' },
        { phrase: 'very low cooling', issueId: 'AC01' },
        { phrase: 'slow cooling', issueId: 'AC01' },
        { phrase: 'thanda nahi kar raha', issueId: 'AC01' },

        // AC02: No Power / Won't Turn On
        { phrase: 'ac on nahi ho raha', issueId: 'AC02' },
        { phrase: 'ac start nahi ho raha', issueId: 'AC02' },
        { phrase: 'power nahi aa rahi', issueId: 'AC02' },
        { phrase: 'display light nahi jal rahi', issueId: 'AC02' },
        { phrase: 'ac completely dead', issueId: 'AC02' },
        { phrase: 'won\'t turn on', issueId: 'AC02' },
        { phrase: 'no power at all', issueId: 'AC02' },

        // AC03: Tripping MCB / Electrical Short
        { phrase: 'mcb trip ho rahi hai', issueId: 'AC03' },
        { phrase: 'ac chalate hi mcb gir jati hai', issueId: 'AC03' },
        { phrase: 'fuse blown', issueId: 'AC03' },
        { phrase: 'short circuit problem', issueId: 'AC03' },
        { phrase: 'circuit breaker tripping', issueId: 'AC03' },

        // AC04: Water Leakage / Dripping
        { phrase: 'paani tapak raha hai', issueId: 'AC04' },
        { phrase: 'pani tapak raha hai indoor unit se', issueId: 'AC04' },
        { phrase: 'ac se paani gir raha hai', issueId: 'AC04' },
        { phrase: 'water leaking from indoor unit', issueId: 'AC04' },
        { phrase: 'water dripping inside room', issueId: 'AC04' },
        { phrase: 'drain pipe leakage', issueId: 'AC04' },

        // AC05: Bad Odor / Foul Smell
        { phrase: 'gandi badbu aa rahi hai', issueId: 'AC05' },
        { phrase: 'bad smell coming from ac', issueId: 'AC05' },
        { phrase: 'foul odor musty smell', issueId: 'AC05' },
        { phrase: 'chemical burning smell', issueId: 'AC05' },

        // AC06: Unusual Noise / Vibration
        { phrase: 'bahut aawaz kar raha hai', issueId: 'AC06' },
        { phrase: 'khad khad awaz aa rahi hai', issueId: 'AC06' },
        { phrase: 'fan making loud noise', issueId: 'AC06' },
        { phrase: 'vibrating outdoor unit', issueId: 'AC06' },
        { phrase: 'rattling noise from ac', issueId: 'AC06' },

        // AC07: Weak Airflow / Fan Not Blowing
        { phrase: 'hawa kam aa rahi hai', issueId: 'AC07' },
        { phrase: 'fan speed bahut slow hai', issueId: 'AC07' },
        { phrase: 'weak airflow', issueId: 'AC07' },
        { phrase: 'air not blowing properly', issueId: 'AC07' },
        { phrase: 'louver swing nahi ho raha', issueId: 'AC07' },

        // AC08: Remote Control Issues
        { phrase: 'remote kaam nahi kar raha', issueId: 'AC08' },
        { phrase: 'remote not responding', issueId: 'AC08' },
        { phrase: 'remote buttons not working', issueId: 'AC08' },
        { phrase: 'remote display blank', issueId: 'AC08' },

        // AC09: Ice / Frost on Coils
        { phrase: 'barf jam gayi hai', issueId: 'AC09' },
        { phrase: 'ice on copper pipe', issueId: 'AC09' },
        { phrase: 'frost on indoor coil', issueId: 'AC09' },
        { phrase: 'coil freezing up', issueId: 'AC09' },

        // AC10: Compressor Frequent Cycling
        { phrase: 'compressor bar bar band ho raha hai', issueId: 'AC10' },
        { phrase: 'compressor cutting off frequently', issueId: 'AC10' },
        { phrase: 'compressor stops after 5 minutes', issueId: 'AC10' },

        // AC11: Blinking Lights / Display Error
        { phrase: 'display light blink kar rahi hai', issueId: 'AC11' },
        { phrase: 'blinking lights on panel', issueId: 'AC11' },
        { phrase: 'flashing led indicators', issueId: 'AC11' },

        // AC12: Dirty Filter / Maintenance Indicator
        { phrase: 'filter saaf karna hai', issueId: 'AC12' },
        { phrase: 'how to clean filter', issueId: 'AC12' },
        { phrase: 'jali saaf karne ka tarika', issueId: 'AC12' },
        { phrase: 'clean filter indicator on', issueId: 'AC12' },

        // AC13: Sensor Failure / Thermistor
        { phrase: 'temperature sensor fault', issueId: 'AC13' },
        { phrase: 'room temperature galat dikha raha', issueId: 'AC13' },

        // AC14: Physical Damage / Front Grille
        { phrase: 'front grille broken', issueId: 'AC14' },
        { phrase: 'body damage loose cabinet', issueId: 'AC14' },

        // AC15: Installation Vibration / Tilt
        { phrase: 'ac installation improper tilt', issueId: 'AC15' },
        { phrase: 'ac tedha laga hua hai', issueId: 'AC15' },

        // AC16: General Hardware Triage / Unknown
        { phrase: 'pcb burnt hardware failure', issueId: 'AC16' },
        { phrase: 'need technician visit repair', issueId: 'AC16' },
        { phrase: 'completely broken need service engineer', issueId: 'AC16' },
      ];

      discretePhrases.forEach((item) => {
        this.addDoc(item.phrase.toLowerCase(), item.issueId);
      });

      this.classifier.train();
      this.isTrained = true;
      this.trainingTimestamp = Date.now();
      console.log('✅ [LayaClassifier] 3-Tier Intent Classifier trained on 16 issue trees (Bilingual EN/HI/Hinglish).');
    } catch (err: any) {
      console.error('❌ [LayaClassifier] Training failed:', err.message);
    }
  }

  /**
   * Classify user natural language input into intent, target tree, confidence, and entities.
   * Execution targets:
   * - Tier 1: < 5ms
   * - Tier 2: < 25ms
   * - Tier 3: < 50ms
   */
  public classify(input: string): LayaClassificationResult {
    const raw = (input || '').trim();
    const text = raw.toLowerCase();

    // Empty query fallback
    if (!text) {
      return {
        intent_type: 'TRIAGE_FALLBACK',
        target_tree_id: 'AC16',
        confidence: 0.1,
        extracted_entities: {},
      };
    }

    const detectedLanguage: 'en' | 'hi' | 'hinglish' = 
      /[\u0900-\u097F]/.test(raw) ? 'hi' :
      /\b(nahi|hai|kya|paani|tapak|awaz|barf|kam|raha|hawa|chal|kar|band)\b/i.test(text) ? 'hinglish' : 'en';

    // ──────────────────────────────────────────────────────────────────────────
    // TIER 1: REGEX & PATTERN MATCHER (< 5ms)
    // ──────────────────────────────────────────────────────────────────────────

    // 1A. Critical Safety & Hazard Override
    const safetyMatch = text.match(/\b(smoke|spark|fire|burning\s?smell|electric\s?shock|blast|flame|shock\s?lag|dhuan|aag|current\s?lag)\b/i);
    if (safetyMatch) {
      return {
        intent_type: 'CRITICAL_SAFETY',
        target_tree_id: 'AC03', // Electrical & circuit breaker safety tree
        confidence: 1.0,
        extracted_entities: {
          safetyHazard: safetyMatch[0],
          symptomPhrase: raw,
          language: detectedLanguage,
          matchedNodeId: 'q1_mcb_trip',
        },
      };
    }

    // 1B. Explicit Error Code Matching (CH XX, CL, FL, HL, Po, Lo, Hi, Od)
    const codeRegex = /\b(ch\s?\d{1,2}|cl|fl|hl|po|lo|hi|od|e\d)\b/i;
    const codeMatch = text.match(codeRegex);
    if (codeMatch) {
      const normalizedCode = codeMatch[0].replace(/\s+/g, ' ').toUpperCase();
      const codeRecord = findErrorCode(normalizedCode) || findErrorCode(normalizedCode.replace(' ', ''));

      if (codeRecord) {
        // Route directly to error code diagnosis (AC03 or specialized node)
        return {
          intent_type: 'ERROR_CODE',
          target_tree_id: 'AC03',
          confidence: 0.99,
          extracted_entities: {
            errorCode: codeRecord.code,
            symptomPhrase: codeRecord.description,
            language: detectedLanguage,
            matchedNodeId: 'q_error_resolution',
          },
        };
      }
    }

    // 1C. Specific Functional Inquiries: Warranty & Maintenance
    if (/(warranty|guarantee|invoice|bill|compressor\s?coverage|amc|registration)/i.test(text)) {
      return {
        intent_type: 'WARRANTY',
        target_tree_id: 'AC01',
        confidence: 0.95,
        extracted_entities: {
          symptomPhrase: 'Warranty Verification Inquiry',
          language: detectedLanguage,
        },
      };
    }

    if (/(how\s?to\s?clean|filter\s?wash|jali\s?saaf|condenser\s?clean|cleaning\s?steps|maintenance\s?manual)/i.test(text)) {
      return {
        intent_type: 'MAINTENANCE',
        target_tree_id: 'AC12',
        confidence: 0.92,
        extracted_entities: {
          symptomPhrase: 'Filter & Preventive Maintenance Cleaning',
          language: detectedLanguage,
          matchedNodeId: 'q1_filter_dirty',
        },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TIER 2: NAIVE BAYES NLP CLASSIFIER (< 25ms)
    // ──────────────────────────────────────────────────────────────────────────
    if (this.isTrained) {
      try {
        const inputTokens = text.split(/[^a-zA-Z0-9\u0900-\u097F]+/).filter((w) => w.length > 1);
        const matchedTokens = inputTokens.filter((w) => this.vocabulary.has(w));

        // If user input shares ZERO tokens with known knowledge base, drop confidence below 0.70
        // Or if the ratio of matched tokens to total tokens is very low (< 0.4 for multi-word queries), treat as UNKNOWN
        const matchRatio = matchedTokens.length / inputTokens.length;
        if (matchedTokens.length > 0 && (inputTokens.length === 1 || matchRatio >= 0.4)) {
          const classifications = this.classifier.getClassifications(text);

          if (classifications && classifications.length > 0) {
            const topMatch = classifications[0];
            let confidence = 0.82;

            if (classifications.length > 1) {
              const runnerUp = classifications[1];
              const margin = Math.abs(topMatch.value - runnerUp.value);
              confidence = margin > 0.001 ? 0.88 : 0.74;

              // If top predictions are too close to call and value is low, return UNKNOWN
              if (margin < 0.0002 && topMatch.value < 0.01) {
                return {
                  intent_type: 'UNKNOWN',
                  target_tree_id: 'AC16',
                  confidence: 0.45,
                  extracted_entities: {
                    symptomPhrase: raw,
                    language: detectedLanguage,
                  },
                };
              }
            }

            // If margin between top and runner up is solid, confidence is high
            // Otherwise, if absolute value is extremely tiny with minimal gap, drop to fallback
            if (topMatch.value < 0.00005) {
              confidence = 0.55;
            }

            // Confidence threshold enforcement (>= 0.70):
            if (confidence >= 0.70) {
              const matchedTree = getTree(topMatch.label);
              return {
                intent_type: 'SYMPTOM_TREE',
                target_tree_id: topMatch.label,
                confidence: Number(confidence.toFixed(2)),
                extracted_entities: {
                  symptomPhrase: matchedTree?.title || topMatch.label,
                  language: detectedLanguage,
                  matchedNodeId: matchedTree?.start_node,
                },
              };
            }
          }
        }
      } catch (err: any) {
        console.warn('⚠️ [LayaClassifier] Tier 2 classification error:', err.message);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TIER 3: FALLBACK TO AC16 TRIAGE TREE (< 50ms)
    // When confidence < 0.70 or no distinct symptom could be resolved
    // ──────────────────────────────────────────────────────────────────────────
    return {
      intent_type: 'TRIAGE_FALLBACK',
      target_tree_id: 'AC16', // General Hardware Triage / Technician Escalation Tree
      confidence: 0.55,
      extracted_entities: {
        symptomPhrase: raw,
        language: detectedLanguage,
        matchedNodeId: 'q1_hardware_symptom',
      },
    };
  }
}

// Singleton export
export const layaClassifier = new LayaIntentClassifier();
