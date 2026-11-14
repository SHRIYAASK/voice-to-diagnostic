import { Router, Request, Response } from 'express';
import { scheduler } from '../services/scheduler';
import { authStore } from '../services/authStore';

const router = Router();

// GET /api/technicians — list all active technicians
router.get('/', (_req: Request, res: Response) => {
  const techs = scheduler.getAllTechnicians();
  res.json({ total: techs.length, technicians: techs });
});

// POST /api/technicians — Admin Creates New Technician
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, email, password, specialization, phone } = req.body;
    if (!name || !email || !specialization) {
      return res.status(400).json({ error: 'Name, email, and specialization are required.' });
    }
    const techUser = authStore.createTechnician({
      name: String(name),
      email: String(email),
      password: password ? String(password) : 'password123',
      specialization: String(specialization),
      phone: phone ? String(phone) : undefined,
    });
    return res.status(201).json({
      success: true,
      technician: techUser,
      message: `Technician ${techUser.name} created successfully.`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to create technician' });
  }
});

// GET /api/technicians/available?date=YYYY-MM-DD
router.get('/available', (req: Request, res: Response) => {
  const date = String(req.query.date || new Date().toISOString().split('T')[0]);
  const slots = scheduler.getAvailableSlots(date);
  res.json({ date, slots });
});

// POST /api/technicians/schedule
router.post('/schedule', (req: Request, res: Response) => {
  const { ticketId, preferredDate, preferredSlot, isElectricalOrInverter } = req.body;
  if (!ticketId || !preferredDate) {
    return res.status(400).json({ error: 'ticketId and preferredDate are required' });
  }

  const appointment = scheduler.bookAppointment({
    ticketId,
    preferredDate,
    preferredSlot,
    isElectricalOrInverter: !!isElectricalOrInverter,
  });

  return res.json({ success: true, appointment });
});

export default router;
