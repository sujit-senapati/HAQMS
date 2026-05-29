const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/doctors
// Retrieve list of doctors with special search filtering
// SECURITY BUG: SQL Injection vulnerability in the search parameter!
// Uses queryRawUnsafe with string concatenation instead of parameterized inputs.
router.get('/', authenticate, async (req, res) => {

  // Direct string interpolation - VULNERABLE TO SQL INJECTION!
  // Example exploit: search=House%' UNION SELECT id, email, password, name, role, '09:00', '17:00', 0, id FROM "User" --

  try {
    const { search, specialization } = req.query;

    // Original code used string concatenation with user input directly in SQL
    // Attack example: search=House%' UNION SELECT id,email,password FROM "User" --
    // This would return all user credentials from the database
    // Prisma's where clause automatically parameterizes all inputs
    const doctors = await prisma.doctor.findMany({
      where: {
        AND: [
          search ? {
            name: { contains: search, mode: 'insensitive' }
          } : {},
          specialization && specialization !== 'All' ? {
            specialization
          } : {}
        ]
      },
      select: {
        id: true,
        userId: true,
        name: true,
        specialization: true,
        department: true,
        consultationFee: true,
        experience: true,
        availableFrom: true,
        availableTo: true,
      },
    });

    // Inconsistent API formatting (directly sending array)
    res.json(doctors);
  } catch (error) {
    // Leaks query syntax details to candidate/attacker

    // REMOVED SQL MESSAGE FROM RESPONSE
    res.status(500).json({ error: 'Database execution failure' });
  }
});

// GET /api/doctors/stats
// Returns aggregation details about available doctors
// PERFORMANCE BUG: Sequential async calls instead of Promise.all()
router.get('/stats', authenticate, async (req, res) => {
  try {
    const start = Date.now();

    // Independent database calls are run sequentially with await, stalling the event loop
    // const totalDoctors = await prisma.doctor.count();

    // const surgeonsCount = await prisma.doctor.count({
    //   where: { department: 'Surgery' },
    // });

    // const averageFee = await prisma.doctor.aggregate({
    //   _avg: {
    //     consultationFee: true,
    //   },
    // });

    // const highestExperience = await prisma.doctor.aggregate({
    //   _max: {
    //     experience: true,
    //   },
    // });

    // USING Promise.all INSTEAD OF SEQUENTIAL AWAIT CALLS TO RUN QUERIES SIMULTANIOUSLY //
    const [totalDoctors, surgeonsCount, averageFee, highestExperience] = await Promise.all([
      prisma.doctor.count(),
      prisma.doctor.count({
        where: { department: 'Surgery' }
      }),
      prisma.doctor.aggregate({
        _avg: { consultationFee: true }
      }),
      prisma.doctor.aggregate({
        _max: { experience: true }
      })
    ]);

    const durationMs = Date.now() - start;

    res.json({
      success: true,
      data: {
        total: totalDoctors,
        surgeons: surgeonsCount,
        averageFee: Math.round(averageFee._avg.consultationFee || 0),
        maxExperience: highestExperience._max.experience || 0,
      }
      // REMOVED DEBUG INFO FROM RESPONSE TO KEEP VULNERABILITIES CONFIDENTAIL
    });
  } catch (error) {
    // REMOVED ERROR OBJECT FROM RESPONSE //
    res.status(500).json({ error: 'Failed to load doctor details' });
  }
});

// GET /api/doctors/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
