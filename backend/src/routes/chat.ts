import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { chatService } from '../engine/chatService';

const router = Router();

// POST /api/chat/session — Get or create a chat session
const sessionSchema = z
  .object({
    sessionId: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
    model: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v && v.trim() ? v.trim() : 'UW-Q18WUZA')),
    language: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => {
      if (!v) return 'en';
      const s = v.toLowerCase();
      if (s.startsWith('ta')) return 'ta';
      if (s.startsWith('hi')) return 'hi';
      return 'en';
    }),
    appliance: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v && v.trim() ? v.trim() : 'air-conditioner')),
  })
  .passthrough()
  .optional()
  .nullable();

router.post('/session', (req: Request, res: Response) => {
  try {
    const rawBody = req.body || {};
    const parsed = sessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      console.error('[API /api/chat/session] Validation error:', parsed.error, 'Body:', req.body);
      return res.status(400).json({ error: 'Invalid session payload', details: parsed.error });
    }

    const data = parsed.data || {
      sessionId: undefined,
      model: 'UW-Q18WUZA',
      language: 'en',
      appliance: 'air-conditioner',
    };

    const session = chatService.getOrCreateSession(
      data.sessionId,
      data.model,
      data.language,
      data.appliance,
      rawBody.currentUser
    );

    return res.json({ session });
  } catch (err: any) {
    console.error('Session error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/chat/message — Send a message or trigger an option
const messageSchema = z
  .object({
    sessionId: z.string(),
    text: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v !== null ? v : undefined)),
    optionIndex: z.union([z.number().int(), z.null(), z.undefined()]).optional().transform((v) => (v !== null ? v : undefined)),
    issueId: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v !== null ? v : undefined)),
    specialAction: z.union([z.string(), z.null(), z.undefined()]).optional().transform((v) => (v !== null ? v : undefined)),
  })
  .passthrough();

router.post('/message', async (req: Request, res: Response) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid message payload', details: parsed.error });
  }

  try {
    const result = await chatService.processMessage(parsed.data.sessionId, {
      text: parsed.data.text,
      optionIndex: parsed.data.optionIndex,
      issueId: parsed.data.issueId,
      specialAction: parsed.data.specialAction,
      currentUser: (req.body as any).currentUser,
    });

    return res.json(result);
  } catch (err: any) {
    console.error('Chat processing error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process chat message' });
  }
});

// POST /api/chat/reset — Reset chat session
router.post('/reset', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const session = chatService.resetSession(sessionId);
  return res.json({ session });
});

export default router;
