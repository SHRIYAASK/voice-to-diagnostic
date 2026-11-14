import { Router, Request, Response } from 'express';
import { getErrorCodes, findErrorCode, searchErrorCodes, getAllTrees } from '../data/store';

const router = Router();

// GET /api/models
router.get('/', (_req: Request, res: Response) => {
  const trees = getAllTrees();
  const models = [
    { id: 'UW-Q18WUZA', name: 'LG 1.5 Ton Window AC (UW-Q18WUZA)', type: 'Window' },
    { id: 'MS-Q18YNZA', name: 'LG 1.5 Ton Dual Inverter Split AC (MS-Q18YNZA)', type: 'Split' },
  ];
  return res.json({ models, issueCount: trees.size });
});

export default router;
