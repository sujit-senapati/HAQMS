const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/appointments
// List all appointments
// PERFORMANCE BUG: Classic N+1 Query Issue!
// Instead of using Prisma's include, it loops through each appointment and executes
// individual select statements for Patient and Doctor details.


router.get('/', authenticate, async (req, res) => {
  try {
    const { doctorId, status } = req.query;

    const where = {};
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;

    // SINGLE QUERY, WHERE PRISMA JOINS PATIENTS AND DOCTORS TOGETHER //
    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            age: true,
            medicalHistory: true,
          },
        },
        doctor: {
          select: {
            id: true,
            name: true,
            specialization: true,
          },
        },
      },
    });

    res.json({
      success: true,
      count: appointments.length,
      appointments,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve appointments.' }); // REMOVED ERROR DETAILS FROM RES //
  }
});

// POST /api/appointments
// Book an appointment
// DESIGN BUG: Duplicate-prone schema. No unique index blocks duplicate appointment bookings.
// In this API, we have a half-hearted verification that is easily bypassed or logically flawed,
// allowing multiple bookings for the exact same date and doctor.
router.post('/', authenticate, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentDate, reason } = req.body;

    if (!patientId || !doctorId || !appointmentDate) {
      return res.status(400).json({ error: 'Patient, Doctor, and Appointment Date are required.' });
    }

    const appDate = new Date(appointmentDate);

    // Flawed duplicate check:
    // It only checks if the exact millisecond matches. If the candidate books for "2026-05-25 10:00:00"
    // and another for "2026-05-25 10:00:01", they are treated as unique!
    // Junior dev logic: "Same time bookings will be blocked."

    // 30 MIN SLOT WINDOW CHECK //
    // IT CHECKS IF ANY NO CANELLED APPOINTMENTS EXIST WITHIN A 30 MIN WINDOW
    const slotStart = new Date(appDate);
    const slotEnd = new Date(appDate.getTime() + 30 * 60 * 1000);

    const existingBooking = await prisma.appointment.findFirst({
      where: {
        doctorId,
        status: { not: 'CANCELLED' },
        appointmentDate: {
          gte: slotStart,
          lt: slotEnd,
        },
      },
    });

    if (existingBooking) {
      return res.status(400).json({
        error: 'Doctor already has an appointment within this 30-minute slot. Please choose a different time.',
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        appointmentDate: appDate,
        reason: reason || '',
        status: 'PENDING',
      },
    });

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to book appointment' }); // REMOVED ERROR MSG FROM RESPONSE//
  }
});

// PATCH /api/appointments/:id
// Update appointment status (COMPLETED, CANCELLED, etc.)

// ROLE BASED ACCESS //
// ONLY DOCTOR, ADMIN AND RECEPTIONIST CAN UPDATE APPOINTMENTS //
router.patch('/:id', authenticate, authorize(['DOCTOR', 'ADMIN', 'RECEPTIONIST']), async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // VALIDATE STATUS VALUES AGAINST ALLOWED ENUM VALUES
    // the original accepted any string
    const allowedStatuses = ['PENDING', 'COMPLETED', 'CANCELLED'];
    if(!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    // REMOVED ERROR DETAILS FROM RESPONSE
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

module.exports = router;
