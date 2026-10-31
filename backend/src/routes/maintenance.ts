import { Router, Request, Response } from 'express';
import { getMaintenanceText } from '../data/store';

const router = Router();

// Named sections extracted from the maintenance manual
const SECTION_MAP: Record<string, string> = {
  filter: '6. AIR FILTER REMOVAL',
  outdoor: '10. OUTDOOR UNIT CONDENSER',
  drain: '12. DRAIN PIPE MAINTENANCE',
  safety: '2. SAFETY PRECAUTIONS',
  schedule: '16. PREVENTIVE MAINTENANCE SCHEDULE',
  general: '1. PURPOSE AND MAINTENANCE BOUNDARIES',
};

function extractSection(text: string, heading: string): string {
  const idx = text.indexOf(heading);
  if (idx === -1) return '';
  // Extract until the next numbered section heading
  const after = text.slice(idx);
  const nextSection = after.slice(1).search(/\n\d+\.\s+[A-Z]/);
  return nextSection === -1 ? after : after.slice(0, nextSection + 1);
}

// GET /api/maintenance/:actionType
router.get('/:actionType', (req: Request, res: Response) => {
  const rawAction = Array.isArray(req.params.actionType) ? req.params.actionType[0] : req.params.actionType;
  const key = rawAction.toLowerCase().replace(/[^a-z]/g, '');
  const heading = SECTION_MAP[key];

  const rawText = getMaintenanceText();

  if (!heading) {
    // Return a brief summary of available sections
    return res.json({
      found: false,
      available: Object.keys(SECTION_MAP),
      hint: 'Use one of the available section keys as the path segment.',
    });
  }

  const section = extractSection(rawText, heading);
  if (!section) {
    return res.json({ found: false, key, content: '' });
  }

  return res.json({ found: true, key, content: section.trim() });
});

export default router;
