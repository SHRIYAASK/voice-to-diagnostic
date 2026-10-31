import { Router, Request, Response } from 'express';
import { findErrorCode, searchErrorCodes, getErrorCodes } from '../data/store';

const router = Router();

// GET /api/error-codes  — list all (paginated)
router.get('/', (_req: Request, res: Response) => {
  const codes = getErrorCodes();
  res.json({ total: codes.length, codes });
});

// GET /api/error-codes/search?q=CH05
router.get('/search', (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const results = searchErrorCodes(q);
  return res.json({ results });
});

// GET /api/error-codes/:code  — exact lookup with alias matching
router.get('/:code', (req: Request, res: Response) => {
  const rawParam = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const code = decodeURIComponent(rawParam);
  const record = findErrorCode(code);
  if (!record) {
    return res.status(404).json({
      found: false,
      message: `Error code "${code}" was not found in the available knowledge base. Please verify the code on your AC display and try again, or contact LG service.`,
    });
  }
  return res.json({ found: true, errorCode: record });
});

export default router;
