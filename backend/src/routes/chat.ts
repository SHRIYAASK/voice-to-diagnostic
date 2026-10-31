import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { chatService } from '../engine/chatService';

const router = Router();

// POST /api/chat/session — Get or create a chat session
const sessionSchema = z.object({
  sessionId: z.string().optional(),
  model: z.string().optional().default('UW-Q18WUZA'),
  language: z.enum(['en', 'hi', 'ta']).optional().default('en'),
  appliance: z.string().optional().default('air-conditioner'),
});

router.post('/session', (req: Request, res: Response) => {
  try {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid session payload', details: parsed.error });
    }

    const session = chatService.getOrCreateSession(
      parsed.data.sessionId,
      parsed.data.model,
      parsed.data.language,
      parsed.data.appliance
    );

    return res.json({ session });
  } catch (err: any) {
    console.error('Session error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/chat/message — Send a message or trigger an option
const messageSchema = z.object({
  sessionId: z.string(),
  text: z.string().optional(),
  optionIndex: z.number().int().optional(),
  issueId: z.string().optional(),
  specialAction: z.string().optional(),
});

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
