import { Router, Request, Response } from 'express';
import { authStore } from '../services/authStore';

const router = Router();

// POST /api/auth/register — Customer Self-Registration
router.post('/register', (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, address, city, pincode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const user = authStore.registerCustomer({
      name: String(name),
      email: String(email),
      password: String(password),
      phone: phone ? String(phone) : undefined,
      address: address ? String(address) : undefined,
      city: city ? String(city) : undefined,
      pincode: pincode ? String(pincode) : undefined,
    });

    const token = `jwt-customer-${user.id}-session`;

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        city: user.city,
        pincode: user.pincode,
      },
      token,
      message: `Welcome to ApplianceCare AI, ${user.name}! Your account has been created.`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// PUT /api/auth/profile — Update User Personal & Service Details (e.g. from Booking)
router.put('/profile', (req: Request, res: Response) => {
  try {
    const { userId, email, name, phone, address, city, pincode } = req.body || {};
    const identifier = userId || email;
    if (!identifier) {
      return res.status(400).json({ error: 'User ID or email is required.' });
    }

    const updated = authStore.updateUser(String(identifier), {
      ...(name ? { name: String(name).trim() } : {}),
      ...(phone ? { phone: String(phone).trim() } : {}),
      ...(address ? { address: String(address).trim() } : {}),
      ...(city ? { city: String(city).trim() } : {}),
      ...(pincode ? { pincode: String(pincode).trim() } : {}),
    });

    return res.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        phone: updated.phone,
        address: updated.address,
        city: updated.city,
        pincode: updated.pincode,
        specialization: updated.specialization,
        employeeCode: updated.employeeCode,
      },
      message: 'Profile details updated successfully.',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to update profile.' });
  }
});

// POST /api/auth/login — Unified Sign In (Customer, Technician, Admin)
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body || {};
    const identifier = String(email || '').trim();
    const pwd = String(password || '').trim();

    if (!identifier) {
      return res.status(400).json({ error: 'Email or username is required.' });
    }

    // 1. Check in authStore
    const user = authStore.authenticate(identifier, pwd);

  if (user) {
    const token = `jwt-${user.role}-${user.id}-token`;
    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialization: user.specialization,
        employeeCode: user.employeeCode,
        rating: user.rating,
        phone: user.phone,
        address: user.address,
        city: user.city,
        pincode: user.pincode,
      },
      token,
      message: `Authenticated successfully as ${user.role.toUpperCase()}: ${user.name}`,
    });
  }

  // 2. If customer entered custom email without prior signup, allow instant friendly onboarding
  if (role === 'customer' || (!identifier.includes('admin') && !identifier.includes('tech'))) {
    const cleanEmail = identifier.toLowerCase();
    const customerName = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ');
    const capitalizedName = customerName.charAt(0).toUpperCase() + customerName.slice(1);

    const newUser = authStore.registerCustomer({
      name: capitalizedName.trim() || 'Valued Customer',
      email: cleanEmail,
      password: pwd || 'password123',
    });

    const token = `jwt-customer-${newUser.id}-token`;
    return res.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        address: newUser.address,
        city: newUser.city,
        pincode: newUser.pincode,
      },
      token,
      message: `Signed in as Customer: ${newUser.name}`,
    });
  }

    return res.status(401).json({
      error: 'Invalid credentials. Please verify your email/username and password.',
    });
  } catch (err: any) {
    console.error('[AUTH LOGIN ERROR]', err);
    return res.status(500).json({ error: err.message || 'Login processing error' });
  }
});

// POST /api/auth/technicians — Create Technician (ADMIN ONLY)
router.post('/technicians', (req: Request, res: Response) => {
  try {
    const { name, email, password, specialization, phone } = req.body;

    if (!name || !email || !specialization) {
      return res.status(400).json({
        error: 'Technician name, email, and specialization are required.',
      });
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
      technician: {
        id: techUser.id,
        name: techUser.name,
        email: techUser.email,
        role: techUser.role,
        specialization: techUser.specialization,
        employeeCode: techUser.employeeCode,
        phone: techUser.phone,
      },
      message: `Technician ${techUser.name} (${techUser.employeeCode}) created successfully by Admin.`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to create technician.' });
  }
});

// GET /api/auth/technicians — List All Registered Technicians
router.get('/technicians', (_req: Request, res: Response) => {
  const techs = authStore.getAllTechnicianUsers();
  res.json({ total: techs.length, technicians: techs });
});

export default router;
