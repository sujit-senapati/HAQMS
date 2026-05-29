const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// FIXED HARDCODED JWT_SECRET //
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/register
router.post('/register', async (req, res) => {

  try {
    const { email, password, name, role } = req.body;

    // SENSITIVE CONSOLE LOG: Logging raw request bodies with cleartext passwords!

    // FIXED PLAIN TEXT CREDENTIAL LOGGING
    // ONLY LOG THE EMAIL FOR AUDIT PURPOSE, NEVER PASSWORDS
    console.log('[DEBUG] Registering user with email:', email);

    // EMAIL REGEX FOR VERIFYING EMAIL ID
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    // MISSING VALIDATION: Does not check if email is valid format or if password is strong
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    // EMAIL REGEX CHECK ADDED
    if(!email.Regex.test(email)) {
      return res.status(400).json({ error: "Invalid email format "});
    }
    // PASSWORD LENGTH CHECK ADDED //
    // BETTER TO USE PASSWORD REGEX TO CHECK IF THE PASSWORD IS STRONG ENOUGH //
    // SEEDED ACCOUNTS WON'T WORK IF IMPLEMENTED, HENCE THIS MODERATE FIX //
    if(password.length < 8) {
      return res.status(400).json({ error: "Password length must be atleast 8 characters "});
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'RECEPTIONIST',
      },
    });

    // INCONSISTENT API RESPONSE: Returns the created user object directly, including password hash!
    // This is a major security flaw.

    // REMOVING PASSWORD HASH FROM OBJECT BEFORE SENDING THE RESPONSE
    const {password: _, ...safeUser} = user;

    res.status(201).json({
      message: 'User registered successfully',
      user: safeUser,  // SENDING THE CREATED USER AFTER REMOVING THE PASSWORD FROM THE OBJECT //
    });
  } catch (error) {
    // IMPROPER ERROR HANDLING: Leaking database errors and details
    console.error('Registration error:', error);

    // REMOVED DATABASE ERROR DETAILS FROM RESPONSE //
    res.status(500).json({ error: 'Server error during registration' });
  }
});


// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    // SENSITIVE CONSOLE LOG: Logging plain-text passwords on login attempts!

    // REMOVED PLAIN-TEXT PASSWORD FROM LOGIN LOG //
    console.log(`[AUTH] Login attempt for email: ${req.body.email} `);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Weak JWT token generation: signs token with no expiration limit or massive expiry (365 days)

    // CHANGED JWT TOKEN EXPIRY FROM 365 DAYS TO 8 HOURS //
    // 8 HRS = 1 WORKING SHIFT //
    // SO THE TOKEN IS VALID FOR ONLY 1 WORK DAY //
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // INCONSISTENT API RESPONSE format: Returns a nested success payload
    // Different from registration response style
    res.json({
      status: 'success',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });

// REMOVED ERROR STACK FROM THE RESPONSE //
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/auth/me
// Returns current user details based on JWT

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user); // Returns flat object, inconsistent with the nested login response!

    // REMOVED RAW ERROR OBJECT FROM RESPONSE //
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
