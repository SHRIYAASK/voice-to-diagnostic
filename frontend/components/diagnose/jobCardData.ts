import { ChatMessageItem } from '../../lib/api';

// Brands the backend registry recognises (backend/src/data/applianceRegistry.json)
const BRANDS = ['LG', 'Samsung', 'Daikin', 'Voltas', 'Hitachi', 'Blue Star', 'Carrier', 'Whirlpool', 'Lloyd', 'Panasonic'];
const DEFAULT_MODEL = 'UW-Q18WUZA'; // app-wide placeholder, not something the user said

export interface CheckItem {
  question: string;
  answer?: string;
  /** done = answered, asking = the open question */
  status: 'done' | 'asking';
}

export interface JobCardData {
  brand?: string;
  model?: string;
  problem?: string;
  checks: CheckItem[];
  conclusion?: NonNullable<ChatMessageItem['conclusion']>;
  safety: boolean;
}

const clean = (t: string) => {
  const lines = t.replace(/\*\*/g, '').split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
  // the real question is the last line that ends in "?"; fall back to the first line
  const q = [...lines].reverse().find((l) => /\?\s*(\(.*\))?\s*$/.test(l)) || lines[0] || '';
  return q.replace(/\s*\((e\.g\.|e\.g).*\)\s*$/i, '').replace(/[?:]\s*$/, '').trim();
};

/** Everything here comes from what the user actually said or what the engine actually returned. */
export function buildJobCard(messages: ChatMessageItem[], selectedModel: string): JobCardData {
  const userTexts = messages.filter((m) => m.sender === 'user').map((m) => m.text);
  const joined = userTexts.join(' \n ');

  let brand: string | undefined;
  for (const b of BRANDS) {
    const re = new RegExp(`(^|[^A-Za-z])${b.replace(' ', '\\s+')}([^A-Za-z]|$)`, 'i');
    if (re.test(joined)) brand = b;
  }

  const checks: CheckItem[] = [];
  messages.forEach((m, i) => {
    if (m.sender !== 'bot' || !m.stepInfo || m.conclusion) return;
    const next = messages.slice(i + 1).find((x) => x.sender === 'user');
    const answered = next && messages.indexOf(next) > i;
    checks.push({ question: clean(m.text), answer: answered ? next!.text : undefined, status: answered ? 'done' : 'asking' });
  });
  // only the latest unanswered question is "asking"
  checks.forEach((c, i) => {
    if (c.status === 'asking' && i !== checks.length - 1) c.status = 'done';
  });

  const conclusionMsg = [...messages].reverse().find((m) => m.conclusion);
  const first = userTexts.find((t) => t && t.trim().length > 2);

  return {
    brand,
    model: selectedModel && selectedModel !== DEFAULT_MODEL ? selectedModel : undefined,
    problem: first ? (first.length > 70 ? first.slice(0, 67) + '…' : first) : undefined,
    checks,
    conclusion: conclusionMsg?.conclusion,
    safety: !!conclusionMsg?.safetyAlert || !!conclusionMsg?.conclusion?.safety_flag,
  };
}
