const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/doctor-stats
// Highly inefficient nested loop aggregate reporting for admin/receptionists dashboard
// PERFORMANCE BUG: Performs multiple nested DB queries inside a loop for every doctor.
// Runs sequentially, blocking/scaling terrible with doctors count.

// ADDED ROLE AUTHORIZATION, REPORTS SHOULD ONLY BE ACCESSIBLE BY ADMIN //
// ORIGINALLY IT CHECKED AUTHENTCATION, ANY LOGGED IN USER COULD ACCESS SENSITIVE INFO //
// A DOCTOR OR RECEPTIONIST COULD VIEW ALL DOCTORS' REVENUE AND PERFORMANCE DATA //
router.get('/doctor-stats', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const start = Date.now();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. Loop through every doctor and query databases sequentially!

    // FETCH EVERYTHING SIMULTANIOUSLY IN 1 Promise.all //
    const [doctors, appointments, todayTokens] = await Promise.all([
      prisma.doctor.findMany(),
      prisma.appointment.findMany({
        select: {
          doctorId: true,
          status: true,
        },
      }),
      prisma.queueToken.findMany({
        where: { createdAt: { gte: today } },
        select: { doctorId: true },
      }),
    ]);


    // AGGREGATE IN MEMEORY, USING .filter() and .length INSTEAD OF DB CALLS INSIDE LOOP
    const reportData = doctors.map((doc) => {
      const doctorAppointments = appointments.filter(a => a.doctorId === doc.id);
      const totalAppointments = doctorAppointments.length;
      const completedAppointments = doctorAppointments.filter(a => a.status === 'COMPLETED').length;
      const cancelledAppointments = doctorAppointments.filter(a => a.status === "CANCELLED").length;
      const todayQueueSize = todayTokens.filter(t => t.doctorId === doc.id).length;

      // Revenue calculated from completedAppointments count * fee //
      // Original fetched full appointments list per doctor separately just for revenue //
      // Now uses the already-filtered count — no extra DB query needed //
      const revenue = completedAppointments * doc.consultationFee;

      return {
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization,
        department: doc.department,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        todayQueueSize: todayQueueSize,
        revenue,
      };
    });

    // REMOVED timeTakenMs FROM RESPONSE //
    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report' }); // REMOVED ERROR OBJECT FROM RES//
  }
});

module.exports = router;
