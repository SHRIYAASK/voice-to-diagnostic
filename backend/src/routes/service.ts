import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { scheduler } from '../services/scheduler';

const router = Router();

// ── Upload config ────────────────────────────────────────────────────────────

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `invoice-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, JPG, and PNG files are accepted.'));
  },
});

// ── Ticket Types & Stores ───────────────────────────────────────────────────

export interface Ticket {
  ticketId: string;
  status: 'open' | 'in_review' | 'assigned' | 'in_progress' | 'resolved';
  createdAt: string;
  customerName: string;
  contactNumber: string;
  customerEmail?: string;
  customerId?: string;
  serviceAddress: string;
  acModel: string;
  serialNumber?: string;
  reportedIssue: string;
  errorCode?: string;
  diagnosticSummary?: string;
  conclusionId?: string;
  invoiceFile?: string;
  assignedTechnician?: {
    id: string;
    name: string;
  };
  scheduledDate?: string;
  scheduledSlot?: string;
  isAlternativeSlot?: boolean;
  technicianNotes?: string;
}

const tickets = new Map<string, Ticket>([
  [
    'AC-SVC-20261011-003',
    {
      ticketId: 'AC-SVC-20261011-003',
      status: 'assigned',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      customerName: 'Rahul Sharma',
      contactNumber: '+91 98765 43210',
      customerEmail: 'customer@appliancecare.ai',
      customerId: 'user-001',
      serviceAddress: 'B-42, Pocket 1, Mayur Vihar Phase 1, New Delhi, 110091',
      acModel: 'UW-Q18WUZA',
      reportedIssue: 'Air Conditioner cooling coil icing up and low airflow',
      errorCode: 'AC01',
      diagnosticSummary: 'Low refrigerant pressure / coil freeze warning. Technician dispatch scheduled.',
      conclusionId: 'AC01_C02',
      assignedTechnician: {
        id: 'tech-001',
        name: 'Vikram Malhotra',
      },
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledSlot: '04:00 PM - 06:00 PM',
      isAlternativeSlot: false,
      technicianNotes: 'Scheduled for refrigerant check and filter coil decontamination.',
    },
  ],
  [
    'AC-SVC-20261010-001',
    {
      ticketId: 'AC-SVC-20261010-001',
      status: 'assigned',
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      customerName: 'Vikram Malhotra',
      contactNumber: '+91 98110 44321',
      customerEmail: 'vikram.m@example.com',
      customerId: 'cust-001',
      serviceAddress: 'Flat 402, Royal Palms, Sector 56, Gurgaon, 122011',
      acModel: 'UW-Q18WUZA',
      serialNumber: 'LG-IN-2024-88319',
      reportedIssue: 'CH 05 Communication Error — AC stops cooling after 3 minutes',
      errorCode: 'CH 05',
      diagnosticSummary: 'Signal cable transmission failure between indoor and outdoor inverter PCB. Requires 28V DC signal probe and wire continuity check.',
      conclusionId: 'AC16_C01',
      assignedTechnician: {
        id: 'tech-002',
        name: 'Anil Kumar',
      },
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledSlot: '11:30 AM - 01:30 PM',
      isAlternativeSlot: false,
      technicianNotes: 'Carrying spare 4-core communication cable and IPM driver board.',
    },
  ],
  [
    'AC-SVC-20261010-002',
    {
      ticketId: 'AC-SVC-20261010-002',
      status: 'in_progress',
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      customerName: 'Pooja Singhania',
      contactNumber: '+91 98765 12340',
      customerEmail: 'pooja.s@example.com',
      customerId: 'cust-002',
      serviceAddress: 'B-12, Green Glen Layout, Bellandur, Bengaluru, 560103',
      acModel: 'UW-Q18WUZA',
      reportedIssue: 'Water dripping continuously from front grill inside bedroom',
      errorCode: 'WATER_LEAK',
      diagnosticSummary: 'Condensate drain tray overflow caused by algae blockage in drain hose. Requires nitrogen purge and tray wash.',
      conclusionId: 'AC04_C02',
      assignedTechnician: {
        id: 'tech-005',
        name: 'Rajesh Sharma',
      },
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledSlot: '02:30 PM - 04:30 PM',
      isAlternativeSlot: false,
      technicianNotes: 'On-site: Disassembled front grill, clearing drain pipe block.',
    },
  ],
  [
    'AC-SVC-20261009-088',
    {
      ticketId: 'AC-SVC-20261009-088',
      status: 'resolved',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      customerName: 'Arjun Dasgupta',
      contactNumber: '+91 99220 55431',
      customerEmail: 'arjun.d@example.com',
      customerId: 'cust-088',
      serviceAddress: 'C-703, Oberoi Splendor, Andheri East, Mumbai, 400060',
      acModel: 'MS-Q18YNZA',
      reportedIssue: 'CH 38 Gas Leakage & Low Refrigerant',
      errorCode: 'CH 38',
      diagnosticSummary: 'R32 subcooling temperature low. Soap bubble test detected minor seepage at flare connection. Flare redone and gas refilled to 125 PSI.',
      conclusionId: 'AC01_C03',
      assignedTechnician: {
        id: 'tech-001',
        name: 'Vikram Malhotra',
      },
      scheduledDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      scheduledSlot: '09:00 AM - 11:00 AM',
      isAlternativeSlot: false,
      technicianNotes: 'Flare nut replaced and torqued to 35 N.m. Cooling verified at 12.5C vent temp. Closed ticket.',
    },
  ],
]);

// Also alias LG-SVC tickets to AC-SVC for backward compatibility
const seedEntries = Array.from(tickets.entries());
seedEntries.forEach(([k, v]) => {
  if (k.startsWith('AC-SVC-')) {
    tickets.set(k.replace('AC-SVC-', 'LG-SVC-'), v);
  }
});

// ── Validation ───────────────────────────────────────────────────────────────

const bookSchema = z.object({
  customerId: z.string().optional(),
  customerEmail: z.string().optional(),
  customerName: z.string().min(2).max(100),
  contactNumber: z.string().min(8).max(15),
  serviceAddress: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  email: z.string().optional(),
  acModel: z.string().min(2).max(100),
  serialNumber: z.string().optional(),
  reportedIssue: z.string().min(2).max(500),
  errorCode: z.string().optional(),
  probableCause: z.string().optional(),
  predictedParts: z.any().optional(),
  priority: z.string().optional(),
  diagnosticSummary: z.string().optional(),
  conclusionId: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  problemDescription: z.string().optional(),
});

// ── POST /api/service/book ───────────────────────────────────────────────────

router.post('/book', upload.any(), (req: Request, res: Response) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const ticketId = `AC-SVC-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const computedAddress = parsed.data.serviceAddress ||
    [parsed.data.address, parsed.data.city, parsed.data.pincode].filter(Boolean).join(', ') ||
    'Not provided';

  const uploadedFile = (req.files && Array.isArray(req.files) && req.files.length > 0)
    ? (req.files as Express.Multer.File[])[0].filename
    : undefined;

  // Assign one of the 10 technicians using scheduler
  const prefDate = parsed.data.preferredDate || new Date().toISOString().split('T')[0];
  const isElec = !!parsed.data.errorCode ||
    (parsed.data.probableCause || '').toLowerCase().includes('inverter') ||
    (parsed.data.reportedIssue || '').toLowerCase().includes('mcb');

  const appointment = scheduler.bookAppointment({
    ticketId,
    preferredDate: prefDate,
    preferredSlot: parsed.data.preferredTime,
    isElectricalOrInverter: isElec,
  });

  const ticket: Ticket = {
    ticketId,
    status: 'assigned',
    createdAt: new Date().toISOString(),
    customerId: parsed.data.customerId,
    customerEmail: parsed.data.customerEmail || parsed.data.email,
    customerName: parsed.data.customerName,
    contactNumber: parsed.data.contactNumber,
    serviceAddress: computedAddress,
    acModel: parsed.data.acModel,
    serialNumber: parsed.data.serialNumber,
    reportedIssue: parsed.data.reportedIssue,
    errorCode: parsed.data.errorCode,
    diagnosticSummary: parsed.data.diagnosticSummary || parsed.data.problemDescription || parsed.data.probableCause,
    conclusionId: parsed.data.conclusionId,
    invoiceFile: uploadedFile,
    assignedTechnician: {
      id: appointment.technicianId,
      name: appointment.technicianName,
    },
    scheduledDate: appointment.date,
    scheduledSlot: appointment.slot,
    isAlternativeSlot: appointment.isAlternativeSlot,
  };

  tickets.set(ticketId, ticket);

  console.log(`[SERVICE] Ticket created: ${ticketId} -> Customer: ${ticket.customerName} (${ticket.customerEmail || 'N/A'}) -> Assigned to ${appointment.technicianName} on ${appointment.date} (${appointment.slot})`);

  return res.status(201).json({
    success: true,
    ticketId,
    status: ticket.status,
    assignedTechnician: ticket.assignedTechnician,
    scheduledDate: ticket.scheduledDate,
    scheduledSlot: ticket.scheduledSlot,
    isAlternativeSlot: ticket.isAlternativeSlot,
    message: `Service request confirmed. Certified Technician ${appointment.technicianName} has been assigned for ${appointment.date} (${appointment.slot}).`,
    createdAt: ticket.createdAt,
  });
});

// ── GET /api/service  — list tickets with role-based filtering ────

router.get('/', (req: Request, res: Response) => {
  const { technicianId, status, customerId, customerEmail, phone, role } = req.query;
  let all = Array.from(tickets.values());

  // Deduplicate tickets
  const uniqueTickets = new Map<string, Ticket>();
  all.forEach((t) => {
    if (!uniqueTickets.has(t.ticketId)) {
      uniqueTickets.set(t.ticketId, t);
    }
  });
  all = Array.from(uniqueTickets.values());

  // 1. Customer Isolation: only see their own tickets
  if (role === 'customer' || customerId || customerEmail) {
    all = all.filter((t) => {
      const matchId = customerId && t.customerId === String(customerId);
      const matchEmail = customerEmail && t.customerEmail?.toLowerCase() === String(customerEmail).toLowerCase();
      const matchPhone = phone && t.contactNumber === String(phone);
      return matchId || matchEmail || matchPhone;
    });
  } 
  // 2. Technician Isolation: only see tickets assigned to them
  else if (role === 'technician' || technicianId) {
    if (technicianId) {
      all = all.filter((t) => t.assignedTechnician?.id === String(technicianId));
    }
  }
  // 3. Admin: all tickets visible (no filter applied unless specifically requested)

  if (status) {
    all = all.filter((t) => t.status === String(status));
  }

  // Sort latest first
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json({ total: all.length, tickets: all });
});

// ── GET /api/service/:ticketId ───────────────────────────────────────────────

router.get('/:ticketId', (req: Request, res: Response) => {
  const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : req.params.ticketId;
  const ticket = tickets.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  const { role, userId, userEmail } = req.query;

  // Authorization check when role is specified
  if (role === 'customer') {
    const isOwner = (userId && ticket.customerId === String(userId)) ||
      (userEmail && ticket.customerEmail?.toLowerCase() === String(userEmail).toLowerCase());
    if (!isOwner) {
      return res.status(403).json({ 
        error: `Access Denied: Ticket ${ticketId} belongs to another customer account. You are only authorized to view your own service requests.` 
      });
    }
  } else if (role === 'technician') {
    const isAssigned = userId && ticket.assignedTechnician?.id === String(userId);
    if (!isAssigned) {
      return res.status(403).json({ 
        error: `Access Denied: Ticket ${ticketId} is assigned to a different technician.` 
      });
    }
  }

  const { invoiceFile: _f, ...safeTicket } = ticket;
  return res.json({ ticket: safeTicket, hasInvoice: !!ticket.invoiceFile });
});

// ── PATCH /api/service/:ticketId/status ──────────────────────────────────────

router.patch('/:ticketId/status', (req: Request, res: Response) => {
  const ticketId = Array.isArray(req.params.ticketId) ? req.params.ticketId[0] : req.params.ticketId;
  const { status, technicianNotes } = req.body;

  const ticket = tickets.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  if (status) ticket.status = status;
  if (technicianNotes) ticket.technicianNotes = technicianNotes;

  return res.json({ success: true, ticket });
});

export default router;
