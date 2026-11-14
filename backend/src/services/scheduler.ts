/**
 * Constraint-Based Technician Scheduling Engine (10 Technicians Pool)
 * Manages load-balancing, specialization matching, slot reservation, and nearest-slot fallback.
 */

export interface Technician {
  id: string;
  name: string;
  employeeCode: string;
  specialization: string;
  certification: string;
  rating: number;
  phone: string;
  activeTickets: number;
  isActive: boolean;
}

export interface SlotAvailability {
  slot: string;
  availableTechsCount: number;
  technicians: Array<{ id: string; name: string; specialization: string }>;
  isFull: boolean;
}

export interface AppointmentRecord {
  ticketId: string;
  technicianId: string;
  technicianName: string;
  date: string;
  slot: string;
  createdAt: string;
  isAlternativeSlot: boolean;
}

// ── Dedicated ApplianceCare Certified Service Technicians ───────────────────
const TECHNICIANS_POOL: Technician[] = [
  {
    id: 'tech-001',
    name: 'Vikram Malhotra',
    employeeCode: 'AC-EMP-9101',
    specialization: 'Inverter Compressor & Sealed System Specialist',
    certification: 'Master Certified HVAC/R Technician',
    rating: 4.95,
    phone: '+91 98110 12341',
    activeTickets: 2,
    isActive: true,
  },
  {
    id: 'tech-002',
    name: 'Anil Kumar',
    employeeCode: 'AC-EMP-9102',
    specialization: 'Inverter IPM Board & Wiring Diagnostics',
    certification: 'Senior Electronic Controls Specialist',
    rating: 4.92,
    phone: '+91 98110 12342',
    activeTickets: 1,
    isActive: true,
  },
  {
    id: 'tech-003',
    name: 'Suresh Raina',
    employeeCode: 'AC-EMP-9103',
    specialization: 'Refrigerant Sealed System & R32/R410A Specialist',
    certification: 'EPA Universal Certified Technician',
    rating: 4.88,
    phone: '+91 98110 12343',
    activeTickets: 3,
    isActive: true,
  },
  {
    id: 'tech-004',
    name: 'Deepak Verma',
    employeeCode: 'AC-EMP-9104',
    specialization: 'BLDC Fan Motor & Electrical Tripping',
    certification: 'Advanced Electrical Diagnostics Certified',
    rating: 4.90,
    phone: '+91 98110 12344',
    activeTickets: 1,
    isActive: true,
  },
  {
    id: 'tech-005',
    name: 'Rajesh Sharma',
    employeeCode: 'AC-EMP-9105',
    specialization: 'Multi-Appliance Mechanical & Hardware Lead',
    certification: 'Master Appliance Systems Specialist',
    rating: 4.85,
    phone: '+91 98110 12345',
    activeTickets: 0,
    isActive: true,
  },
  {
    id: 'tech-006',
    name: 'Manoj Tiwari',
    employeeCode: 'AC-EMP-9106',
    specialization: 'Installation, Cabinet Alignment & Drainage',
    certification: 'Certified Field Installation Expert',
    rating: 4.87,
    phone: '+91 98110 12346',
    activeTickets: 2,
    isActive: true,
  },
  {
    id: 'tech-007',
    name: 'Pooja Patel',
    employeeCode: 'AC-EMP-9107',
    specialization: 'Digital Communication Error & Microcontroller Diagnostics',
    certification: 'Microprocessor & Bus Systems Certified',
    rating: 4.96,
    phone: '+91 98110 12347',
    activeTickets: 1,
    isActive: true,
  },
  {
    id: 'tech-008',
    name: 'Arun Joshi',
    employeeCode: 'AC-EMP-9108',
    specialization: 'Thermistors, Sensors & Temperature Control Circuits',
    certification: 'Sensor Circuit Calibration Certified',
    rating: 4.84,
    phone: '+91 98110 12348',
    activeTickets: 0,
    isActive: true,
  },
  {
    id: 'tech-009',
    name: 'Amitabh Singh',
    employeeCode: 'AC-EMP-9109',
    specialization: 'Deep Cleaning, Coil De-scaling & Sanitation',
    certification: 'Maintenance & Sanitation Specialist',
    rating: 4.89,
    phone: '+91 98110 12349',
    activeTickets: 2,
    isActive: true,
  },
  {
    id: 'tech-010',
    name: 'Rohan Das',
    employeeCode: 'AC-EMP-9110',
    specialization: 'Emergency Field Triage & High-Voltage Safety',
    certification: 'ApplianceCare Emergency Safety Certified',
    rating: 4.91,
    phone: '+91 98110 12350',
    activeTickets: 1,
    isActive: true,
  },
];

const STANDARD_SLOTS = [
  '09:00 AM - 11:00 AM',
  '11:30 AM - 01:30 PM',
  '02:30 PM - 04:30 PM',
  '05:00 PM - 07:00 PM',
];

// In-memory slot booking store: key = `${date}_${slot}_${techId}`
const bookedSlots = new Map<string, string>(); // maps slot key to ticketId
const appointments = new Map<string, AppointmentRecord>(); // ticketId to appointment

export class TechnicianScheduler {
  public getAllTechnicians(): Technician[] {
    return TECHNICIANS_POOL;
  }

  public getTechnicianById(techId: string): Technician | undefined {
    return TECHNICIANS_POOL.find((t) => t.id === techId);
  }

  public getAvailableSlots(date: string): SlotAvailability[] {
    return STANDARD_SLOTS.map((slot) => {
      const freeTechs = TECHNICIANS_POOL.filter((tech) => {
        const key = `${date}_${slot}_${tech.id}`;
        return !bookedSlots.has(key);
      });

      return {
        slot,
        availableTechsCount: freeTechs.length,
        technicians: freeTechs.map((t) => ({ id: t.id, name: t.name, specialization: t.specialization })),
        isFull: freeTechs.length === 0,
      };
    });
  }

  public bookAppointment(params: {
    ticketId: string;
    preferredDate: string;
    preferredSlot?: string;
    isElectricalOrInverter?: boolean;
  }): AppointmentRecord {
    const { ticketId, preferredDate, isElectricalOrInverter } = params;
    const requestedSlot = params.preferredSlot || STANDARD_SLOTS[0];

    // 1. Try finding a free technician for the exact requested date & slot
    const freeTechsExact = TECHNICIANS_POOL.filter((tech) => {
      const key = `${preferredDate}_${requestedSlot}_${tech.id}`;
      return !bookedSlots.has(key);
    });

    if (freeTechsExact.length > 0) {
      // Prioritize specialization and lower active workload
      freeTechsExact.sort((a, b) => {
        if (isElectricalOrInverter) {
          const aSpec = a.specialization.toLowerCase().includes('inverter') || a.specialization.toLowerCase().includes('board');
          const bSpec = b.specialization.toLowerCase().includes('inverter') || b.specialization.toLowerCase().includes('board');
          if (aSpec && !bSpec) return -1;
          if (!aSpec && bSpec) return 1;
        }
        return a.activeTickets - b.activeTickets;
      });

      const assignedTech = freeTechsExact[0];
      const slotKey = `${preferredDate}_${requestedSlot}_${assignedTech.id}`;
      bookedSlots.set(slotKey, ticketId);
      assignedTech.activeTickets += 1;

      const record: AppointmentRecord = {
        ticketId,
        technicianId: assignedTech.id,
        technicianName: assignedTech.name,
        date: preferredDate,
        slot: requestedSlot,
        createdAt: new Date().toISOString(),
        isAlternativeSlot: false,
      };
      appointments.set(ticketId, record);
      return record;
    }

    // 2. Fallback: Preferred slot is full -> Find the nearest available slot across the 10 techs
    for (const slot of STANDARD_SLOTS) {
      if (slot === requestedSlot) continue;
      const freeTechs = TECHNICIANS_POOL.filter((t) => !bookedSlots.has(`${preferredDate}_${slot}_${t.id}`));
      if (freeTechs.length > 0) {
        freeTechs.sort((a, b) => a.activeTickets - b.activeTickets);
        const assignedTech = freeTechs[0];
        const slotKey = `${preferredDate}_${slot}_${assignedTech.id}`;
        bookedSlots.set(slotKey, ticketId);
        assignedTech.activeTickets += 1;

        const record: AppointmentRecord = {
          ticketId,
          technicianId: assignedTech.id,
          technicianName: assignedTech.name,
          date: preferredDate,
          slot,
          createdAt: new Date().toISOString(),
          isAlternativeSlot: true,
        };
        appointments.set(ticketId, record);
        return record;
      }
    }

    // 3. Fallback to next day morning
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDate = tomorrow.toISOString().split('T')[0];
    const assignedTech = TECHNICIANS_POOL[0];
    const fallbackSlot = STANDARD_SLOTS[0];

    const record: AppointmentRecord = {
      ticketId,
      technicianId: assignedTech.id,
      technicianName: assignedTech.name,
      date: nextDate,
      slot: fallbackSlot,
      createdAt: new Date().toISOString(),
      isAlternativeSlot: true,
    };
    appointments.set(ticketId, record);
    return record;
  }

  public getAppointmentByTicketId(ticketId: string): AppointmentRecord | undefined {
    return appointments.get(ticketId);
  }

  public addTechnician(data: {
    name: string;
    specialization: string;
    certification?: string;
    phone?: string;
    employeeCode?: string;
  }): Technician {
    const nextIdx = TECHNICIANS_POOL.length + 1;
    const newTech: Technician = {
      id: `tech-${String(nextIdx).padStart(3, '0')}`,
      name: data.name,
      employeeCode: data.employeeCode || `AC-EMP-${9100 + nextIdx}`,
      specialization: data.specialization || 'Multi-Appliance Field Specialist',
      certification: data.certification || 'Certified Appliance Diagnostics Engineer',
      rating: 5.0,
      phone: data.phone || '+91 98000 00000',
      activeTickets: 0,
      isActive: true,
    };
    TECHNICIANS_POOL.push(newTech);
    return newTech;
  }
}

export const scheduler = new TechnicianScheduler();
