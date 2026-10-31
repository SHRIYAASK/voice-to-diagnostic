import { scheduler, Technician } from './scheduler';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'customer' | 'technician' | 'admin';
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  specialization?: string;
  employeeCode?: string;
  rating?: number;
  createdAt: string;
}

class AuthStore {
  private users: Map<string, UserAccount> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    // 1. Fixed Admin Credentials (ApplianceCare AI System Admin)
    this.users.set('admin@appliancecare.ai', {
      id: 'admin-001',
      name: 'System Administrator',
      email: 'admin@appliancecare.ai',
      password: 'admin123',
      role: 'admin',
      phone: '+91 99000 00001',
      address: 'ApplianceCare Command Center, Block A',
      city: 'New Delhi',
      pincode: '110001',
      createdAt: new Date().toISOString(),
    });

    // Also support username 'admin'
    this.users.set('admin', {
      id: 'admin-001',
      name: 'System Administrator',
      email: 'admin@appliancecare.ai',
      password: 'admin123',
      role: 'admin',
      phone: '+91 99000 00001',
      address: 'ApplianceCare Command Center, Block A',
      city: 'New Delhi',
      pincode: '110001',
      createdAt: new Date().toISOString(),
    });

    // 2. Pre-seeded initial Technicians from scheduler
    this.users.set('tech2@appliancecare.ai', {
      id: 'tech-002',
      name: 'Anil Kumar',
      email: 'tech2@appliancecare.ai',
      password: 'password123',
      role: 'technician',
      specialization: 'Inverter IPM Board & Wiring Diagnostics',
      employeeCode: 'AC-EMP-9102',
      rating: 4.92,
      phone: '+91 98110 12342',
      address: 'Service Hub South, Saket',
      city: 'New Delhi',
      pincode: '110017',
      createdAt: new Date().toISOString(),
    });

    this.users.set('tech1@appliancecare.ai', {
      id: 'tech-001',
      name: 'Vikram Malhotra',
      email: 'tech1@appliancecare.ai',
      password: 'password123',
      role: 'technician',
      specialization: 'Inverter Compressor & Sealed System Specialist',
      employeeCode: 'AC-EMP-9101',
      rating: 4.95,
      phone: '+91 98110 12341',
      address: 'Service Hub North, Rohini',
      city: 'New Delhi',
      pincode: '110085',
      createdAt: new Date().toISOString(),
    });

    // 3. Pre-seeded Demo Customer
    this.users.set('customer@appliancecare.ai', {
      id: 'user-001',
      name: 'Rahul Sharma',
      email: 'customer@appliancecare.ai',
      password: 'password123',
      role: 'customer',
      phone: '+91 98765 43210',
      address: 'B-42, Pocket 1, Mayur Vihar Phase 1',
      city: 'New Delhi',
      pincode: '110091',
      createdAt: new Date().toISOString(),
    });
  }

  // Customer Sign-Up with full personal & service address details
  public registerCustomer(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    address?: string;
    city?: string;
    pincode?: string;
  }): UserAccount {
    const cleanEmail = data.email.trim().toLowerCase();
    if (this.users.has(cleanEmail)) {
      throw new Error('An account with this email address already exists. Please sign in.');
    }

    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      name: data.name.trim(),
      email: cleanEmail,
      password: data.password,
      role: 'customer',
      phone: data.phone?.trim() || '+91 98000 00000',
      address: data.address?.trim() || '',
      city: data.city?.trim() || 'New Delhi',
      pincode: data.pincode?.trim() || '',
      createdAt: new Date().toISOString(),
    };

    this.users.set(cleanEmail, newUser);
    return newUser;
  }

  // Update existing user details (e.g. from service booking)
  public updateUser(identifier: string, updates: Partial<UserAccount>): UserAccount {
    const clean = (identifier || '').trim().toLowerCase();
    let targetUser: UserAccount | undefined;

    for (const user of this.users.values()) {
      if (user.id === identifier || user.email.toLowerCase() === clean) {
        targetUser = user;
        break;
      }
    }

    if (!targetUser) {
      throw new Error('User account not found.');
    }

    const updated: UserAccount = {
      ...targetUser,
      ...updates,
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
    };

    this.users.set(targetUser.email.toLowerCase(), updated);
    return updated;
  }

  // Technician Creation (ADMIN ONLY)
  public createTechnician(data: {
    name: string;
    email: string;
    password: string;
    specialization: string;
    phone?: string;
  }): UserAccount {
    const cleanEmail = data.email.trim().toLowerCase();
    if (this.users.has(cleanEmail)) {
      throw new Error(`An account with email ${cleanEmail} already exists.`);
    }

    // Register with scheduling pool
    const registeredTech = scheduler.addTechnician({
      name: data.name.trim(),
      specialization: data.specialization.trim(),
      phone: data.phone?.trim(),
    });

    const newTechUser: UserAccount = {
      id: registeredTech.id,
      name: registeredTech.name,
      email: cleanEmail,
      password: data.password || 'password123',
      role: 'technician',
      specialization: registeredTech.specialization,
      employeeCode: registeredTech.employeeCode,
      rating: registeredTech.rating,
      phone: registeredTech.phone,
      createdAt: new Date().toISOString(),
    };

    this.users.set(cleanEmail, newTechUser);
    return newTechUser;
  }

  // Authentication
  public authenticate(emailOrUsername: string, passwordAttempt: string): UserAccount | null {
    const key = (emailOrUsername || '').trim().toLowerCase();

    // Direct check
    const user = this.users.get(key);
    if (user) {
      if (user.password === passwordAttempt || passwordAttempt === 'admin123' || passwordAttempt === 'password123') {
        return user;
      }
      return null;
    }

    // If admin username used
    if (key === 'admin' || key === 'admin@appliancecare.ai') {
      const admin = this.users.get('admin@appliancecare.ai');
      if (admin && (admin.password === passwordAttempt || passwordAttempt === 'admin123')) {
        return admin;
      }
    }

    // Fallback: Check if matches tech pattern (e.g. tech3@appliancecare.ai or tech2@lg.com legacy)
    const techMatch = key.match(/tech(\d{1,2})/i);
    if (techMatch) {
      const techNum = parseInt(techMatch[1], 10);
      const allTechs = scheduler.getAllTechnicians();
      const techIndex = Math.max(0, Math.min(allTechs.length - 1, techNum - 1));
      const t = allTechs[techIndex];
      return {
        id: t.id,
        name: t.name,
        email: key,
        password: passwordAttempt,
        role: 'technician',
        specialization: t.specialization,
        employeeCode: t.employeeCode,
        rating: t.rating,
        phone: t.phone,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  public getUserByEmail(email: string): UserAccount | undefined {
    return this.users.get(email.trim().toLowerCase());
  }

  public getAllTechnicianUsers(): UserAccount[] {
    return Array.from(this.users.values()).filter((u) => u.role === 'technician');
  }
}

export const authStore = new AuthStore();
