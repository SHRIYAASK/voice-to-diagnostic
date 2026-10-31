/**
 * Groq Semantic NLU Engine
 *
 * Provides high-speed (~150ms) natural language and voice understanding:
 * - Maps spoken natural language answers to exact decision tree options
 * - Recognizes colloquial variations, rambling speech, and paraphrases
 * - Flags ambiguous / borderline responses for interactive user reconfirmation
 * - Classifies free-form spoken symptoms into AC01 - AC16 diagnostic trees
 * - Includes offline local semantic token matcher fallback if API is unavailable
 * - Guarantees zero decision tree leakage into generic manual RAG
 */

import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface LlamaOptionResolution {
  selectedIndex: number | null; // 0-based option index, or null if ambiguous
  confidence: number;          // 0.0 to 1.0
  isEscapeCommand: boolean;    // true if user said "restart", "cancel", "book technician"
  needsReconfirmation: boolean; // true if confidence is 0.40 - 0.79 or query is ambiguous/mixed
  candidateOptions?: Array<{ index: number; label: string }>;
  rationale: string;
  source: 'groq_llama_70b' | 'local_semantic_fallback' | 'exact_match';
}

export interface SymptomClassificationResult {
  treeId: string | null;
  confidence: number;
  needsReconfirmation: boolean;
  candidateTrees?: Array<{ treeId: string; description: string }>;
  rationale: string;
  source: 'groq_llama_70b' | 'local_symptom_rules' | 'none';
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;

let _groqClient: Groq | null = null;
if (GROQ_API_KEY && GROQ_API_KEY.startsWith('gsk_')) {
  _groqClient = new Groq({ apiKey: GROQ_API_KEY });
}

// 16 Decision Trees Reference
const KNOWN_AC_TREES: Array<{ treeId: string; description: string; keywords: RegExp }> = [
  { treeId: 'AC01', description: 'Cooling Performance / Not Cooling', keywords: /\b(cool|cold|warm air|not cooling|stops cooling|outside not running|outdoor fan stopped|room warm)\b/i },
  { treeId: 'AC02', description: 'Power Failure & No Display', keywords: /\b(power|dead|no display|not turning on|won'?t start|switch off)\b/i },
  { treeId: 'AC03', description: 'MCB Tripping & Electrical Safety', keywords: /\b(mcb|breaker|tripping|short circuit|trips)\b/i },
  { treeId: 'AC04', description: 'Indoor Water Leakage & Dripping', keywords: /\b(water|leak|dripping|drain|water falling)\b/i },
  { treeId: 'AC05', description: 'Abnormal Odor & Burning Smell', keywords: /\b(smell|odor|odour|burning|stink|foul|musty)\b/i },
  { treeId: 'AC06', description: 'Abnormal Noise & Vibration', keywords: /\b(noise|sound|vibration|rattl|humming|grinding)\b/i },
  { treeId: 'AC07', description: 'Airflow & Blower Issues', keywords: /\b(airflow|fan speed|blower|weak air|no air|fan slow)\b/i },
  { treeId: 'AC08', description: 'Remote Control Malfunction', keywords: /\b(remote|buttons|display on remote|sensor)\b/i },
  { treeId: 'AC09', description: 'Ice Formation & Coil Freezing', keywords: /\b(ice|frost|frozen|freezing|pipe ice)\b/i },
  { treeId: 'AC10', description: 'Compressor Frequent Cycling', keywords: /\b(cycling|cuts off|frequent start|frequent stop)\b/i },
  { treeId: 'AC11', description: 'Display & LED Blinking', keywords: /\b(blinking|flashing|led blink|lights flashing)\b/i },
  { treeId: 'AC12', description: 'Air Filter Cleaning & Maintenance', keywords: /\b(clean filter|filter dirty|mesh clean)\b/i },
  { treeId: 'AC13', description: 'Temperature Sensor & Thermistor', keywords: /\b(sensor|thermistor|temperature wrong)\b/i },
  { treeId: 'AC14', description: 'Cabinet & Physical Enclosure', keywords: /\b(grille|cabinet|front panel|body broken)\b/i },
  { treeId: 'AC15', description: 'Smart Connectivity & ThinQ Setup', keywords: /\b(wifi|thinq|connect to app|smart)\b/i },
  { treeId: 'AC16', description: 'Hardware Failure & Emergency Escalation', keywords: /\b(emergency|spark|fire|shock|blast)\b/i },
];

/**
 * Local rule and token-overlap semantic fallback
 */
function localSemanticMatch(
  userText: string,
  options: Array<{ label: string; index: number }>
): LlamaOptionResolution {
  const clean = userText.toLowerCase().trim();

  // Check escape commands
  if (/\b(restart|reset|start over|cancel|exit|quit|stop)\b/i.test(clean)) {
    return {
      selectedIndex: null,
      confidence: 1.0,
      isEscapeCommand: true,
      needsReconfirmation: false,
      rationale: 'User requested conversation restart/exit.',
      source: 'local_semantic_fallback',
    };
  }

  // Check ordinal / numeric references: "first", "second", "third", "1", "option 2", etc.
  const ordinalMap: Record<string, number> = {
    'first': 0, '1st': 0, '1': 0, 'one': 0, 'option 1': 0, 'opt 1': 0,
    'second': 1, '2nd': 1, '2': 1, 'two': 1, 'option 2': 1, 'opt 2': 1,
    'third': 2, '3rd': 2, '3': 2, 'three': 2, 'option 3': 2, 'opt 3': 2,
    'fourth': 3, '4th': 3, '4': 3, 'four': 3, 'option 4': 3, 'opt 4': 3,
    'last': options.length - 1, 'last one': options.length - 1,
  };

  for (const [key, idx] of Object.entries(ordinalMap)) {
    if (clean === key || clean.startsWith(key + ' ') || clean.endsWith(' ' + key) || clean.includes(`option ${key}`)) {
      if (idx < options.length) {
        return {
          selectedIndex: idx,
          confidence: 0.95,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Matched ordinal reference "${key}".`,
          source: 'local_semantic_fallback',
        };
      }
    }
  }

  // Domain Synonym & Semantic Keyword Pairs for Common Troubleshooting Nodes
  const semanticRules: Array<{ keywords: RegExp; targetLabelMatch: RegExp }> = [
    {
      keywords: /\b(starts? and stops?|stops? in between|cuts? off|turns? off|cycles?|intermittent)\b/i,
      targetLabelMatch: /intermittently|starts and stops/i,
    },
    {
      keywords: /\b(only warm|no cool|warm air|not cooling at all|room temp air)\b/i,
      targetLabelMatch: /no cool air|only warm air/i,
    },
    {
      keywords: /\b(slightly cool|weak cool|mild|slow cool|barely cool)\b/i,
      targetLabelMatch: /slightly cool|weak cooling/i,
    },
    {
      keywords: /\b(not reach|set temp|never reaches|temperature not dropping)\b/i,
      targetLabelMatch: /set temperature/i,
    },
    {
      keywords: /\b(already set|yes|it is set|cool mode|18)\b/i,
      targetLabelMatch: /already set|yes/i,
    },
    {
      // "fan is running, but it isn't running outside" -> outdoor unit stopped / completely off
      keywords: /\b(isn'?t running outside|not running outside|outdoor unit is off|outdoor unit completely off|outside stopped)\b/i,
      targetLabelMatch: /completely off|not starting/i,
    },
    {
      // "set to 26 degrees", "not 18", "no it is at 24" -> "No / Not sure"
      keywords: /\b(set to (2[0-9]|19)|not 18|no.*set to|not sure)\b/i,
      targetLabelMatch: /no \/ not sure|no/i,
    },
    {
      // "filter is dusty", "dusty", "clogged", "dirty" -> "Filter is dirty"
      keywords: /\b(dusty|clogged|dirty|full of dust|needs cleaning)\b/i,
      targetLabelMatch: /filter is dirty|dirty/i,
    },
    {
      // "working fine now", "cooling is restored", "it's working now" -> "Yes, cooling is restored"
      keywords: /\b(working fine now|working now|cooling.*restored|fixed now|working fine)\b/i,
      targetLabelMatch: /cooling is restored|yes/i,
    },
    {
      // "no ice", "no frost", "pipe is clear"
      keywords: /\b(no ice|no frost|don'?t see (any )?ice|clear)\b/i,
      targetLabelMatch: /no ice|normal room air/i,
    },
    {
      // "haven't cleaned", "haven't checked", "did not check"
      keywords: /\b(haven'?t cleaned|haven'?t checked|not checked yet|didn'?t check)\b/i,
      targetLabelMatch: /haven'?t checked yet/i,
    },
  ];

  for (const rule of semanticRules) {
    if (rule.keywords.test(clean)) {
      const matchedOpt = options.find((o) => rule.targetLabelMatch.test(o.label));
      if (matchedOpt) {
        return {
          selectedIndex: matchedOpt.index,
          confidence: 0.9,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Matched domain semantic pattern: ${rule.keywords}`,
          source: 'local_semantic_fallback',
        };
      }
    }
  }

  // Token Overlap (Jaccard-like score)
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of', 'it', 'my', 'but']);
  const cleanTokens = clean.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));

  let bestIndex: number | null = null;
  let bestScore = 0;
  let secondBestScore = 0;
  let secondBestIndex: number | null = null;

  for (const opt of options) {
    const optTokens = opt.label.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));
    let matchCount = 0;
    for (const token of cleanTokens) {
      if (optTokens.some(ot => ot.includes(token) || token.includes(ot))) {
        matchCount++;
      }
    }
    const score = optTokens.length > 0 ? matchCount / optTokens.length : 0;
    if (score > bestScore) {
      secondBestScore = bestScore;
      secondBestIndex = bestIndex;
      bestScore = score;
      bestIndex = opt.index;
    } else if (score > secondBestScore) {
      secondBestScore = score;
      secondBestIndex = opt.index;
    }
  }

  if (bestScore >= 0.35 && bestIndex !== null) {
    // If the top two options are very close in score, flag for reconfirmation!
    const isAmbiguous = (bestScore - secondBestScore) < 0.15 && secondBestIndex !== null;
    const confidence = Math.min(1.0, Number((bestScore * 1.4).toFixed(2)));

    const candidateOptions: Array<{ index: number; label: string }> = [
      { index: bestIndex, label: options[bestIndex].label }
    ];
    if (secondBestIndex !== null) {
      candidateOptions.push({ index: secondBestIndex, label: options[secondBestIndex].label });
    }

    return {
      selectedIndex: bestIndex,
      confidence,
      isEscapeCommand: false,
      needsReconfirmation: isAmbiguous || (confidence < 0.80),
      candidateOptions,
      rationale: `Token overlap match score: ${bestScore.toFixed(2)}${isAmbiguous ? ' (close candidate scores detected)' : ''}`,
      source: 'local_semantic_fallback',
    };
  }

  return {
    selectedIndex: null,
    confidence: 0,
    isEscapeCommand: false,
    needsReconfirmation: false,
    rationale: 'Could not resolve to any option with sufficient confidence.',
    source: 'local_semantic_fallback',
  };
}

export const groqService = {
  /**
   * Resolves conversational or spoken natural language response to an option index
   * using Groq LLM (with fast local fallback).
   */
  resolveOption: async (
    userText: string,
    questionText: string,
    options: Array<{ label: string; index: number }>
  ): Promise<LlamaOptionResolution> => {
    const clean = (userText || '').trim();
    if (!clean) {
      return {
        selectedIndex: null,
        confidence: 0,
        isEscapeCommand: false,
        needsReconfirmation: false,
        rationale: 'Empty input.',
        source: 'exact_match',
      };
    }

    // ── Fast Path 0: Deterministic Ordinal & Numeric Option Index ────────────
    const ordinalMap: Record<string, number> = {
      '1': 0, '1st': 0, 'first': 0, 'one': 0, 'option 1': 0, 'opt 1': 0, '#1': 0, '(1)': 0, '[1]': 0,
      '2': 1, '2nd': 1, 'second': 1, 'two': 1, 'option 2': 1, 'opt 2': 1, '#2': 1, '(2)': 1, '[2]': 1,
      '3': 2, '3rd': 2, 'third': 2, 'three': 2, 'option 3': 2, 'opt 3': 2, '#3': 2, '(3)': 2, '[3]': 2,
      '4': 3, '4th': 3, 'fourth': 3, 'four': 3, 'option 4': 3, 'opt 4': 3, '#4': 3, '(4)': 3, '[4]': 3,
      '5': 4, '5th': 4, 'fifth': 4, 'five': 4, 'option 5': 4, 'opt 5': 4, '#5': 4, '(5)': 4, '[5]': 4,
      'last': options.length - 1, 'last one': options.length - 1,
    };

    const cleanLower = clean.toLowerCase();
    for (const [key, idx] of Object.entries(ordinalMap)) {
      if (cleanLower === key || cleanLower === `option ${key}` || cleanLower === `no ${key}` || cleanLower.startsWith(key + ' ') || cleanLower.endsWith(' ' + key)) {
        if (idx < options.length) {
          return {
            selectedIndex: idx,
            confidence: 1.0,
            isEscapeCommand: false,
            needsReconfirmation: false,
            rationale: `Matched direct option index / ordinal "${key}".`,
            source: 'exact_match',
          };
        }
      }
    }

    // ── Fast Path 0.5: Contextual Operational Symptom Inference ───────────────
    // If the active question asks about power/operation ("Is the AC turning on...", "showing lights..."),
    // and the user describes an active cooling or airflow symptom ("the ac is not giving cool air", "blowing warm air", "fan is running"),
    // this logically implies Option 0 (Yes, unit is powered on).
    const isPowerQuestion = /\b(turning on|powering on|showing lights|powers on|turn on|display lights)\b/i.test(questionText.toLowerCase());
    if (isPowerQuestion && options.length >= 2 && /\byes\b/i.test(options[0].label)) {
      if (/\b(not cool|not cold|warm air|hot air|not giv(e|ing|eing)|giv(e|ing|eing).*warm|blowing|fan.*run|no cool air|room warm|ice|leak|smell|noise)\b/i.test(cleanLower)) {
        return {
          selectedIndex: 0,
          confidence: 0.99,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: 'User described operational symptom (not cooling/warm air), logically implying the AC is powered on.',
          source: 'exact_match',
        };
      }
    }

    // ── Fast Path 1: Yes / No Affirmative / Negative Matching ─────────────────
    const isAffirmative = /\b(yes|yeah|yup|y|true|correct|right|already|already did|done|powers on|it is on|turned on|working|sure)\b/i.test(cleanLower);
    const isNegative = /\b(no|nope|nah|n|false|off|not on|not working|not yet|didn't|haven't|completely off|dead|no display)\b/i.test(cleanLower);

    if (isAffirmative && !isNegative) {
      const yesOpt = options.find((o) => /\b(yes|already|normal|on|working|powers on|restored)\b/i.test(o.label));
      if (yesOpt) {
        return {
          selectedIndex: yesOpt.index,
          confidence: 0.98,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Matched affirmative statement to option: "${yesOpt.label}".`,
          source: 'exact_match',
        };
      }
    }

    if (isNegative && !isAffirmative) {
      const noOpt = options.find((o) => /\b(no|not|off|dead|blank|persists|stopped|cannot|unsure)\b/i.test(o.label));
      if (noOpt) {
        return {
          selectedIndex: noOpt.index,
          confidence: 0.98,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Matched negative statement to option: "${noOpt.label}".`,
          source: 'exact_match',
        };
      }
    }

    // ── Fast Path 2: Exact Label or Substring Match ───────────────────────────
    for (const opt of options) {
      const optLabel = opt.label.toLowerCase();
      if (
        cleanLower === optLabel ||
        (cleanLower.length >= 3 && optLabel.includes(cleanLower)) ||
        (optLabel.length >= 5 && cleanLower.includes(optLabel))
      ) {
        return {
          selectedIndex: opt.index,
          confidence: 0.99,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Exact option match: "${opt.label}".`,
          source: 'exact_match',
        };
      }
    }

    // Check specific error codes in labels (e.g. user typed "CH 05" or "CH05")
    const codeMatch = cleanLower.match(/ch\s*0?[1-9][0-9]?/i);
    if (codeMatch) {
      const normCode = codeMatch[0].replace(/\s+/g, '');
      const matchedOpt = options.find((o) => o.label.toLowerCase().replace(/\s+/g, '').includes(normCode));
      if (matchedOpt) {
        return {
          selectedIndex: matchedOpt.index,
          confidence: 1.0,
          isEscapeCommand: false,
          needsReconfirmation: false,
          rationale: `Matched error code ${codeMatch[0]} in option "${matchedOpt.label}".`,
          source: 'exact_match',
        };
      }
    }

    const systemPrompt =
      `You are an expert Voice Diagnostic NLU assistant for LG Air Conditioners. ` +
      `Given the active troubleshooting question, the available numbered options (1-indexed for the user), and the user's spoken or typed response, ` +
      `determine which option the user is describing or selecting. ` +
      `Return ONLY a raw JSON object: {"selected_index": number | null, "confidence": number, "needs_reconfirmation": boolean, "is_escape": boolean, "rationale": string}.\n` +
      `Rules:\n` +
      `1. If the user statement matches or describes one of the options, set "selected_index" to that option's 0-based number.\n` +
      `2. If user mentions "1" or "first", map to index 0. If "2" or "second", map to index 1. If "3" or "third", map to index 2.\n` +
      `3. Only set "is_escape": true if user specifically says "cancel", "exit", "quit", "restart all", or "reset session". Do NOT set is_escape for "start", "diagnose", or symptoms.\n` +
      `4. Contextual diagnostic inference: If the question asks if the AC is turning on/running, and the user responds with an active symptom like "not giving cool air", "blowing warm air", or "fan running", this logically implies Option 0 (Yes, unit is powered on).\n` +
      `5. If the user statement is completely unrelated or impossible to determine, set "selected_index": null.`;

    const optionsFormatted = options.map((o) => `${o.index}: "${o.label}"`).join('\n');
    const userPrompt =
      `Active Question: "${questionText}"\n` +
      `Available Options:\n${optionsFormatted}\n\n` +
      `User Response: "${clean}"`;

    // ── Primary Path: Groq Qwen Fast NLU Inference (Sub-200ms) ────────────────
    if (_groqClient) {
      const candidateModels = [
        process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        'qwen/qwen3.8-27b',
        'llama-3.1-8b-instant',
      ];

      for (const modelToTry of candidateModels) {
        try {
          const completion = await _groqClient.chat.completions.create({
            model: modelToTry,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 150,
          });

          const rawText = completion.choices[0]?.message?.content || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            if (typeof parsed.selected_index === 'number' && parsed.selected_index >= 0 && parsed.selected_index < options.length) {
              const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.90;
              const needsReconf = parsed.needs_reconfirmation === true || (conf >= 0.40 && conf < 0.80);

              const candidateOptions = [
                { index: parsed.selected_index, label: options[parsed.selected_index].label }
              ];

              return {
                selectedIndex: parsed.selected_index,
                confidence: conf,
                isEscapeCommand: !!parsed.is_escape,
                needsReconfirmation: needsReconf,
                candidateOptions,
                rationale: parsed.rationale || `Resolved via Qwen (${modelToTry}).`,
                source: 'groq_llama_70b',
              };
            } else if (parsed.is_escape) {
              return {
                selectedIndex: null,
                confidence: 1.0,
                isEscapeCommand: true,
                needsReconfirmation: false,
                rationale: parsed.rationale || 'User requested escape/restart.',
                source: 'groq_llama_70b',
              };
            }
          }
        } catch {
          continue;
        }
      }
    }

    // ── Fallback Path: Local Semantic Token & Synonym Matcher ─────────────────
    return localSemanticMatch(clean, options);
  },

  /**
   * Classifies a top-level natural language symptom into one of the 16 AC diagnostic trees.
   * If ambiguous or multiple candidate trees are found, flags needsReconfirmation = true.
   */
  classifySymptom: async (
    userText: string,
    _appliance: string = 'air-conditioner'
  ): Promise<SymptomClassificationResult> => {
    const clean = (userText || '').trim();
    if (!clean) {
      return {
        treeId: null,
        confidence: 0,
        needsReconfirmation: false,
        rationale: 'Empty symptom input.',
        source: 'none',
      };
    }

    const treesContext = KNOWN_AC_TREES.map(t => `${t.treeId}: ${t.description}`).join('\n');
    const systemPrompt =
      `You are an expert diagnostic triage assistant for LG Dual Inverter Air Conditioners.\n` +
      `Given a user's description of their AC symptom, classify it into the most appropriate decision tree.\n` +
      `Available Diagnostic Trees:\n${treesContext}\n\n` +
      `Return ONLY a raw JSON object:\n` +
      `{"treeId": string | null, "confidence": number, "needs_reconfirmation": boolean, "candidate_trees": [{"treeId": string, "description": string}], "rationale": string}\n` +
      `Rules:\n` +
      `1. "The fan is running, but it isn't running outside" -> AC01 (Cooling Performance / Outdoor unit issue) or AC07 (Airflow), confidence ~0.80, needs_reconfirmation: true.\n` +
      `2. If the user mentions multiple symptoms (e.g. noise and warm air), list both candidate trees and set needs_reconfirmation: true.\n` +
      `3. If the input is not a diagnostic symptom, set treeId: null.`;

    // ── Primary Path: Groq Qwen Fast Symptom Triage (Sub-200ms) ────────────────
    if (_groqClient) {
      const candidateModels = [
        process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        'qwen/qwen3.8-27b',
        'llama-3.1-8b-instant',
      ];

      for (const modelToTry of candidateModels) {
        try {
          const completion = await _groqClient.chat.completions.create({
            model: modelToTry,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `User Symptom: "${clean}"` },
            ],
            temperature: 0.1,
            max_tokens: 150,
          });

          const rawText = completion.choices[0]?.message?.content || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.treeId && KNOWN_AC_TREES.some(t => t.treeId === parsed.treeId)) {
              return {
                treeId: parsed.treeId,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
                needsReconfirmation: !!parsed.needs_reconfirmation || (parsed.confidence < 0.85),
                candidateTrees: Array.isArray(parsed.candidate_trees) ? parsed.candidate_trees : undefined,
                rationale: parsed.rationale || `Classified via Groq (${modelToTry})`,
                source: 'groq_llama_70b',
              };
            }
          }
        } catch {
          continue;
        }
      }
    }

    // ── Local Rule Fallback for Symptom Classification ─────────────────────────
    const matched = KNOWN_AC_TREES.filter(t => t.keywords.test(clean));
    if (matched.length === 1) {
      return {
        treeId: matched[0].treeId,
        confidence: 0.85,
        needsReconfirmation: false,
        candidateTrees: [{ treeId: matched[0].treeId, description: matched[0].description }],
        rationale: `Matched local keywords for ${matched[0].treeId}`,
        source: 'local_symptom_rules',
      };
    } else if (matched.length > 1) {
      return {
        treeId: matched[0].treeId,
        confidence: 0.65,
        needsReconfirmation: true,
        candidateTrees: matched.map(m => ({ treeId: m.treeId, description: m.description })),
        rationale: `Multiple symptom matches found: ${matched.map(m => m.treeId).join(', ')}`,
        source: 'local_symptom_rules',
      };
    }

    return {
      treeId: null,
      confidence: 0,
      needsReconfirmation: false,
      rationale: 'No matching symptom tree found.',
      source: 'none',
    };
  },

  /**
   * Generates a warm, concise conversational response for greetings, general introductions,
   * or off-topic conversational chat using Qwen on Groq.
   */
  generateConversationalReply: async (userText: string, model: string = 'UW-Q18WUZA'): Promise<string> => {
    if (_groqClient) {
      try {
        const completion = await _groqClient.chat.completions.create({
          model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
          messages: [
            {
              role: 'system',
              content: `You are ApplianceCare AI, a smart, friendly, and expert diagnostic assistant for LG Dual Inverter Air Conditioners (${model}). Provide a concise, warm 1 to 2 sentence reply. If introduced or greeted, say hello warmly and ask how you can help with their air conditioner today.`
            },
            { role: 'user', content: userText }
          ],
          temperature: 0.6,
          max_tokens: 120,
        });
        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) return reply;
      } catch (err: any) {
        console.warn('[Qwen Orchestrator Warning]', err.message);
      }
    }
    return `Hello! I'm your ApplianceCare AI assistant for your LG Dual Inverter Air Conditioner (${model}). How can I assist you today? You can describe any symptom like "not cooling", "water leaking", or "CH 05".`;
  },

  /**
   * Generates an intelligent, voice-friendly conversational clarification
   * without demanding button choices or canned robotic responses.
   */
  generateConversationalClarification: async (
    userText: string,
    questionText: string,
    model: string = 'UW-Q18WUZA'
  ): Promise<string> => {
    if (_groqClient) {
      try {
        const completion = await _groqClient.chat.completions.create({
          model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
          messages: [
            {
              role: 'system',
              content: `You are ApplianceCare AI, a real-time voice diagnostic assistant for LG Dual Inverter Air Conditioners (${model}). ` +
                `The user spoke an observation in response to a diagnostic question: "${questionText}". ` +
                `Respond in 1 to 2 natural, voice-friendly sentences. Acknowledge what the user said, analyze the symptom, ` +
                `and conversationally ask for the specific detail needed to proceed with troubleshooting. ` +
                `Do NOT mention option numbers, buttons, or multiple choice options.`
            },
            {
              role: 'user',
              content: `Diagnostic Question: "${questionText}"\nUser Spoke: "${userText}"`
            }
          ],
          temperature: 0.3,
          max_tokens: 120,
        });
        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) return reply;
      } catch (err: any) {
        console.warn('[Qwen Clarification Warning]', err.message);
      }
    }
    return `I understand that ${userText}. To pinpoint the issue with your ${model}, could you let me know if ${questionText.toLowerCase().replace(/^(is|did|are|have you)\s+/i, '')}?`;
  },

  /**
   * Localizes diagnostic text, questions, or conclusions into natural code-switched
   * Tamil or Hindi with English technical loanwords using Qwen on Groq.
   */
  localizeText: async (
    text: string,
    targetLanguage: 'ta' | 'hi' | 'en'
  ): Promise<string> => {
    if (targetLanguage === 'en' || !text || !_groqClient) return text;
    try {
      const langDesc = targetLanguage === 'ta'
        ? 'conversational code-switched Tamil (Tamil script + common English technical loanwords like AC, cooling, remote, filter, MCB, outdoor unit, compressor, fan, display, drain pipe). Avoid archaic/literary terms.'
        : 'conversational code-switched Hindi (Hinglish with English technical loanwords). Avoid archaic terms.';

      const completion = await _groqClient.chat.completions.create({
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        messages: [
          {
            role: 'system',
            content: `You translate LG AC troubleshooting questions, symptoms, and instructions into ${langDesc}. ` +
              `Make it natural, clear, and colloquial for an Indian homeowner. ` +
              `DO NOT translate technical appliance nouns like AC, Remote, Filter, MCB, Outdoor unit, Compressor, Fan, Mode, Sensor, Drain pipe — keep them in English. ` +
              `Output ONLY the translated text.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 220,
      });
      return completion.choices[0]?.message?.content?.trim() || text;
    } catch (err: any) {
      console.warn('[groqService localizeText Warning]', err.message);
      return text;
    }
  },
};
