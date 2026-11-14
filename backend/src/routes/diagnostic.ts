import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAllTrees } from '../data/store';
import {
  startSession,
  nextStep,
  backStep,
  getSessionHistory,
} from '../engine/diagnostic';

import { intentEngine } from '../engine/classifier';

const router = Router();

// Train local intent engine on startup
intentEngine.train();

// POST /api/diagnostic/classify — Lightweight Intent Classification
router.post('/classify', (req: Request, res: Response) => {
  const query = String(req.body.query || req.body.message || '').trim();
  const result = intentEngine.classify(query);
  return res.json({ result });
});

// GET /api/diagnostic/issues
router.get('/issues', (_req: Request, res: Response) => {
  const trees = getAllTrees();
  const issues = Array.from(trees.values()).map(t => ({
    issue_id: t.issue_id,
    title: t.title,
    nodeCount: t.nodes.length,
    conclusionCount: Object.keys(t.conclusions).length,
  }));
  res.json({ issues });
});

// POST /api/diagnostic/start
const startSchema = z.object({ issueId: z.string().min(2).max(10) });

router.post('/start', (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'issueId is required (e.g. AC01)' });

  const result = startSession(parsed.data.issueId);
  if ('error' in result) return res.status(404).json(result);
  return res.json(result);
});

// POST /api/diagnostic/next
const nextSchema = z.object({
  sessionId: z.string().uuid(),
  optionIndex: z.number().int().min(0),
});

router.post('/next', (req: Request, res: Response) => {
  const parsed = nextSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'sessionId (uuid) and optionIndex (int) required' });

  const step = nextStep(parsed.data.sessionId, parsed.data.optionIndex);
  if ('error' in step) return res.status(400).json(step);
  return res.json({ step });
});

// POST /api/diagnostic/back
router.post('/back', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const step = backStep(sessionId);
  if ('error' in step) return res.status(400).json(step);
  return res.json({ step });
});

// GET /api/diagnostic/session/:sessionId
router.get('/session/:sessionId', (req: Request, res: Response) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const history = getSessionHistory(sessionId);
  if (!history) return res.status(404).json({ error: 'Session not found' });
  return res.json(history);
});

export default router;
