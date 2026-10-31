import { Router, Request, Response } from 'express';
import { getWarrantyText } from '../data/store';

const router = Router();

// GET /api/warranty
router.get('/', (_req: Request, res: Response) => {
  const text = getWarrantyText();

  // Extract key sections
  const sections = extractWarrantySections(text);

  res.json({
    disclaimer:
      'The information below is derived from the supplied knowledge base and has NOT been independently verified as current official LG Electronics India policy. Final warranty eligibility is determined by LG or its authorised service process under the applicable written warranty terms.',
    sections,
  });
});

function extractWarrantySections(text: string): Record<string, string> {
  const sectionHeadings = [
    { key: 'standard_coverage', heading: '1. STANDARD WARRANTY COVERAGE' },
    { key: 'exclusions', heading: '3. EXCLUSIONS' },
    { key: 'claim_process', heading: '5. CLAIM PROCESS' },
    { key: 'faq', heading: '11. CUSTOMER FAQ' },
  ];

  const result: Record<string, string> = {};

  for (const { key, heading } of sectionHeadings) {
    const idx = text.indexOf(heading);
    if (idx === -1) continue;
    const after = text.slice(idx);
    const nextSection = after.slice(1).search(/\n\d+\.\s+[A-Z]/);
    result[key] = (nextSection === -1 ? after : after.slice(0, nextSection + 1)).trim();
  }

  return result;
}

export default router;
