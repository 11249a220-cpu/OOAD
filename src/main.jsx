import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QRCodeCanvas } from 'qrcode.react'
import './styles.css'

const ROTATION_SECONDS = 10
const SESSION_KEY = 'rollcall-session'
const ATTENDANCE_KEY = 'rollcall-attendance'
const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL || (window.location.hostname === 'localhost' ? 'http://192.168.0.225:5173' : window.location.origin)

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback }
}

function App() {
  const isStudentLink = new URLSearchParams(window.location.search).has('session')
  const [view, setView] = useState(() => isStudentLink ? 'student' : 'teacher')
  const [session, setSession] = useState(() => loadJson(SESSION_KEY, null))
  const [attendance, setAttendance] = useState(() => loadJson(ATTENDANCE_KEY, []))
  const [notice, setNotice] = useState(null)
  const [cloudAvailable, setCloudAvailable] = useState(false)

  useEffect(() => { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY) }, [session])
  useEffect(() => { localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance)) }, [attendance])
  useEffect(() => {
    async function syncState() {
      try {
        const response = await fetch('/api/state')
        if (!response.ok) throw new Error('API unavailable')
        const state = await response.json()
        setSession(state.session)
        setAttendance(state.attendance)
        setCloudAvailable(true)
      } catch {
        setCloudAvailable(false)
      }
    }
    syncState()
    const timer = window.setInterval(syncState, 1000)
    return () => window.clearInterval(timer)
  }, [])

  function showNotice(message, type = 'success') {
    setNotice({ message, type })
    window.setTimeout(() => setNotice(null), 3600)
  }
  async function startSession(subject) {
    if (cloudAvailable) {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject }) })
      const state = await response.json()
      setSession(state.session); setAttendance(state.attendance); showNotice('Attendance session started'); return
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
    setSession({ id, subject, startedAt: new Date().toISOString(), active: true })
    setAttendance([]); showNotice('Attendance session started')
  }
  async function stopSession() {
    if (cloudAvailable) {
      const response = await fetch('/api/session', { method: 'PATCH' })
      const state = await response.json()
      setSession(state.session); showNotice('Session closed'); return
    }
    setSession((current) => current ? { ...current, active: false } : current); showNotice('Session closed')
  }
  async function submitAttendance(values) {
    if (!values.email.toLowerCase().endsWith('@kanchiuniv.ac.in')) {
      showNotice('Use your Kanchi University email address.', 'error')
      return false
    }
    if (cloudAvailable) {
      const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
      const state = await response.json()
      if (!response.ok) { showNotice(state.message, 'error'); return false }
      setSession(state.session); setAttendance(state.attendance); showNotice(`Welcome, ${values.fullName}. Attendance marked.`); return true
    }
    if (attendance.some((entry) => entry.rollNumber.toLowerCase() === values.rollNumber.toLowerCase())) {
      showNotice('This roll number is already marked present.', 'error'); return false
    }
    setAttendance((current) => [{ ...values, id: Date.now(), markedAt: new Date().toISOString() }, ...current])
    showNotice(`Welcome, ${values.fullName}. Attendance marked.`); return true
  }
  function exportCsv() {
    const rows = [['Full name', 'Roll number', 'Email', 'Marked at'], ...attendance.map((entry) => [entry.fullName, entry.rollNumber, entry.email, new Date(entry.markedAt).toLocaleString()])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a')
    link.href = url; link.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>RollCall</span></div><div className="topbar-meta"><span className="status-dot" /> Prototype mode</div></header>
    <main><section className="intro"><div><p className="lede">A fast, rotating QR check-in for classrooms. Start a session, put it on the screen, and watch the room fill in.</p></div><div className="date-stamp">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div></section>
      {notice && <div className={`notice ${notice.type}`} role="status">{notice.message}</div>}
      {view === 'teacher' && !isStudentLink ? <TeacherView session={session} attendance={attendance} onStart={startSession} onStop={stopSession} onExport={exportCsv} /> : <StudentView session={session} onSubmit={submitAttendance} />}
    </main>
  </div>
}

function TeacherView({ session, attendance, onStart, onStop, onExport }) {
  const [subject, setSubject] = useState('')
  return <section className="dashboard-grid"><div className="primary-column">{!session || !session.active ? <div className="panel start-panel"><div className="panel-label">New attendance session</div><h2>Ready when you are.</h2><p>Students will scan a QR code and enter their details. The code changes every 10 seconds.</p><label>Class or subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Data Structures" /></label><button className="button primary" onClick={() => onStart(subject || 'Class attendance')}>Start session <span>→</span></button></div> : <QrPanel session={session} onStop={onStop} />}</div>
    <aside className="side-column"><div className="stat-panel"><span className="panel-label">Present now</span><strong>{String(attendance.length).padStart(2, '0')}</strong><span className="stat-caption">students checked in</span></div><div className="panel attendance-panel"><div className="panel-heading"><div><span className="panel-label">Live register</span><h3>{session?.subject || 'No active session'}</h3></div><button className="icon-button" onClick={onExport} disabled={!attendance.length} title="Export attendance as CSV">↓</button></div>{attendance.length ? <div className="register">{attendance.map((entry) => <div className="register-row" key={entry.id}><span className="avatar">{entry.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{entry.fullName}</strong><small>{entry.rollNumber} · {entry.email}</small></div><time>{new Date(entry.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div> : <div className="empty-state"><span>◎</span><p>Attendance entries will appear here in real time.</p></div>}</div></aside>
  </section>
}

function QrPanel({ session, onStop }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer) }, [])
  const slot = Math.floor(now / (ROTATION_SECONDS * 1000)); const remaining = ROTATION_SECONDS - Math.floor((now / 1000) % ROTATION_SECONDS)
  const token = useMemo(() => `${session.id}.${slot}.${Math.random().toString(36).slice(2, 8)}`, [session.id, slot])
  const checkInUrl = `${PUBLIC_APP_URL}${window.location.pathname}?session=${session.id}&token=${token}&subject=${encodeURIComponent(session.subject)}`
  return <div className="panel qr-panel"><div className="qr-header"><div><span className="live-pill"><span /> Live session</span><h2>{session.subject}</h2><p>Ask students to scan the code below. It refreshes automatically.</p></div><button className="button quiet" onClick={onStop}>End session</button></div><div className="qr-stage"><div className="qr-frame" aria-label="Rotating attendance QR code"><QRCodeCanvas value={checkInUrl} size={224} bgColor="#ffffff" fgColor="#102a43" level="M" /><span className="qr-corner tl" /><span className="qr-corner tr" /><span className="qr-corner bl" /><span className="qr-corner br" /></div></div></div>
}

function StudentView({ session, onSubmit }) {
  const params = new URLSearchParams(window.location.search); const [values, setValues] = useState({ fullName: '', rollNumber: '', email: '' }); const [submitted, setSubmitted] = useState(false)
  const hasQrSession = Boolean(params.get('session') && params.get('token'))
  const isOpen = hasQrSession || (session?.active && (!params.get('session') || params.get('session') === session.id))
  const subject = session?.subject || params.get('subject') || 'Attendance check-in'
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })) }
  async function submit(event) { event.preventDefault(); if (await onSubmit(values)) setSubmitted(true) }
  return <section className="student-wrap"><div className="panel student-card">{submitted ? <div className="success-state"><span className="success-icon">✓</span><p className="eyebrow">Check-in confirmed</p><h2>You’re on the register.</h2><p>Your attendance was marked successfully. You can close this page now.</p></div> : <><div className="student-heading"><span className="panel-label">Student check-in</span><h2>{isOpen ? subject : 'No open session'}</h2><p>{isOpen ? 'Enter your details exactly as they appear on the class register.' : 'Ask your teacher to start an attendance session, then scan the new QR code.'}</p></div><form onSubmit={submit}><label>Full name<input required value={values.fullName} onChange={(event) => update('fullName', event.target.value)} /></label><label>Roll number<input required value={values.rollNumber} onChange={(event) => update('rollNumber', event.target.value)} /></label><label>Email address<input required type="email" pattern=".+@kanchiuniv\.ac\.in$" title="Use your Kanchi University email address ending in @kanchiuniv.ac.in" value={values.email} onChange={(event) => update('email', event.target.value)} /></label><button className="button primary full" disabled={!isOpen}>Mark my attendance <span>→</span></button></form></>}</div><div className="student-note"><span>◷</span><p>Use your Kanchi University email ending in @kanchiuniv.ac.in.</p></div></section>
}

createRoot(document.getElementById('root')).render(<App />)