const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorizeAdminOnlyLegacy } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/patients
// Replaced in-memory pagination with database-level pagination
// Original fetched ALL patients into memory then sliced in JavaScript
// With 10,000 patients that means loading all 10,000 for every page request
// Now database returns only the rows needed using skip/take (SQL OFFSET/LIMIT)
// Moved search and gender filtering to database WHERE clause
// Original filtered in JavaScript after loading everything into memory
// Now database only returns matching rows — vastly more efficient at scale
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, gender } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    // Build database-level WHERE clause
    const where = {
      AND: [
        // Search filter — database handles text matching
        search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNumber: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        } : {},
        // Gender filter
        gender && gender !== 'All' ? {
          gender: { equals: gender, mode: 'insensitive' }
        } : {}
      ]
    };

    // Run count and data queries in parallel using Promise.all
    // Original ran them sequentially — now both run simultaneously
    const [patients, totalPatients] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,   // SQL OFFSET — skip previous pages
        take: limit,    // SQL LIMIT — only return this page
      }),
      prisma.patient.count({ where })
    ]);

    res.json({
      success: true,
      patients,
      pagination: {
        page,
        limit,
        totalPatients,
        totalPages: Math.ceil(totalPatients / limit),
      },
    });
  } catch (error) {
    // Removed error details from response
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: true,
      },
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(patient);
  } catch (error) {
    // Removed raw error.message from response
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// POST /api/patients
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, email, phoneNumber, age, gender, medicalHistory } = req.body;

    if (!name || !phoneNumber || !age || !gender) {
      return res.status(400).json({ error: 'Name, phoneNumber, age, and gender are required.' });
    }

    // Added phone number format validation
    // Original accepted any string — "abc" could be stored as a phone number
    // Now validates basic numeric phone format
    const phoneRegex = /^[+]?[\d\s\-().]{7,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    // FIX 7: Added age range validation
    // Original accepted any integer — negative ages or age 999 would be stored
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 150) {
      return res.status(400).json({ error: 'Age must be a valid number between 0 and 150.' });
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        email: email || null,
        phoneNumber,
        age: parsedAge,
        gender,
        medicalHistory: medicalHistory || null,
      },
    });

    // Removed error details from response
    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// DELETE /api/patients/:id
// fix already applied in middleware/auth.js —
// authorizeAdminOnlyLegacy now correctly blocks non-admin users
// The middleware fix means this route is now properly protected
router.delete('/:id', authenticate, authorizeAdminOnlyLegacy, async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await prisma.patient.delete({ where: { id } });

    // Removed patient name from response to avoid data leakage
    res.json({ message: 'Patient record successfully deleted.' });
  } catch (error) {
    // Removed error details from response
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;