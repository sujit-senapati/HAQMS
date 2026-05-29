'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/common/Navbar';
import Link from 'next/link';
import { 
  FileText, ArrowLeft, Calendar, 
  AlertCircle, ClipboardList, User 
} from 'lucide-react';

export default function PatientHistoryRecords() {
  const { id } = useParams();
  const router = useRouter();
  const { token, API_BASE_URL, user, loading: authLoading } = useAuth();

  const [patient, setPatient] = useState(null);
  const [recordLoading, setRecordLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;

    // Navigation guard — only doctors and admins should access medical records
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }

    fetchPatientRecords();
  }, [user, id, authLoading]);

  const fetchPatientRecords = async () => {
    try {
      setRecordLoading(true);
      const res = await fetch(`${API_BASE_URL}/patients/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to fetch patient records');
      }

      const data = await res.json();
      setPatient(data);
    } catch (err) {
      console.error('Error fetching patient records:', err);
      setError('Unable to load patient records. Please try again.');
    } finally {
      setRecordLoading(false);
    }
  };

  // ── Loading State ─────────────────────────────────────────────
  if (recordLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="pulse-loader mx-auto">
              <div></div>
              <div></div>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-400">
              Loading patient records...
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8">
          <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-start gap-4">
            <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-lg">Failed to Load Records</h3>
              <p className="text-sm mt-1">{error}</p>
              <button
                onClick={() => router.back()}
                className="mt-4 text-xs font-bold underline"
              >
                Go Back
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── No Patient Found ──────────────────────────────────────────
  if (!patient) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8">
          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-800 text-center">
            <p className="text-slate-400 font-semibold">Patient not found.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-teal-600 font-bold text-sm underline">
              Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8">

        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-teal-600 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Patient List
        </button>

        {/* Patient Header */}
        <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-500/10 rounded-xl">
              <User className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                {patient.name}
              </h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
                <span>Age: {patient.age}</span>
                <span>Gender: {patient.gender}</span>
                {patient.phoneNumber && <span>Contact: {patient.phoneNumber}</span>}
                {patient.email && <span>Email: {patient.email}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Medical History */}
        <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md mb-6">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <ClipboardList className="h-5 w-5 text-teal-600" />
            Clinical Background
          </h2>

          {patient.medicalHistory ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-slate-700 dark:text-slate-300 text-sm leading-6 font-medium whitespace-pre-wrap">
                {patient.medicalHistory}
              </p>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
              <p className="text-slate-400 text-sm italic">
                No medical history on record for this patient.
              </p>
            </div>
          )}
        </div>

        {/* Appointment History */}
        <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-teal-600" />
            Diagnostic & Appointment Records
          </h2>

          {patient.appointments && patient.appointments.length > 0 ? (
            <div className="space-y-3">
              {patient.appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-teal-500/10 rounded-lg mt-0.5">
                      <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {new Date(apt.appointmentDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                        {apt.reason || 'No reason provided'}
                      </p>
                    </div>
                  </div>

                  <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-xs font-extrabold tracking-wide uppercase ${
                    apt.status === 'COMPLETED'
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                      : apt.status === 'CANCELLED'
                      ? 'bg-rose-500/10 text-rose-500'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    {apt.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm italic">
                No appointment records found for this patient.
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}