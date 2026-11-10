import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sharedState = { session: null, attendance: [] }
const attendanceDirectory = path.resolve(process.cwd(), 'attendance')

function dailyStoragePath(subject, date = new Date()) {
	const safeSubject = subject.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'class_attendance'
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = date.getFullYear()
	const folderName = `${safeSubject}_${day}-${month}-${year}`
	return {
		directory: path.join(attendanceDirectory, folderName),
		file: path.join(attendanceDirectory, folderName, 'students.json'),
		label: `${day}/${month}/${year}`,
	}
}

async function saveDailyAttendance(session, entry) {
	const storage = dailyStoragePath(session.subject)
	await mkdir(storage.directory, { recursive: true })
	let savedEntries = []
	try {
		const savedFile = await readFile(storage.file, 'utf8')
		savedEntries = JSON.parse(savedFile).attendance || []
	} catch {
		// Create the daily student list when this is the first submission.
	}
	if (!savedEntries.some((savedEntry) => savedEntry.rollNumber.toLowerCase() === entry.rollNumber.toLowerCase())) {
		savedEntries.push(entry)
	}
	await writeFile(storage.file, JSON.stringify({ subject: session.subject, date: storage.label, attendance: savedEntries }, null, 2))
}

function sendJson(response, status, payload) {
	response.statusCode = status
	response.setHeader('Content-Type', 'application/json')
	response.end(JSON.stringify(payload))
}

function readBody(request) {
	return new Promise((resolve) => {
		let body = ''
		request.on('data', (chunk) => { body += chunk })
		request.on('end', () => resolve(body ? JSON.parse(body) : {}))
	})
}

function attendanceApi() {
	return {
		name: 'attendance-api',
		configureServer(server) {
			server.middlewares.use('/api', async (request, response, next) => {
				if (request.url === '/state' && request.method === 'GET') {
					sendJson(response, 200, sharedState)
					return
				}
				if (request.url === '/session' && request.method === 'POST') {
					const body = await readBody(request)
					  sharedState.session = { id: randomUUID(), subject: body.subject || 'Class attendance', startedAt: new Date().toISOString(), active: true }
					sharedState.attendance = []
					sendJson(response, 200, sharedState)
					return
				}
				if (request.url === '/session' && request.method === 'PATCH') {
					if (sharedState.session) sharedState.session.active = false
					sendJson(response, 200, sharedState)
					return
				}
				if (request.url === '/attendance' && request.method === 'POST') {
					const body = await readBody(request)
					if (!sharedState.session?.active) { sendJson(response, 409, { message: 'There is no active attendance session.' }); return }
					if (!body.email?.toLowerCase().endsWith('@kanchiuniv.ac.in')) { sendJson(response, 422, { message: 'Use your Kanchi University email address.' }); return }
					const duplicate = sharedState.attendance.some((entry) => entry.rollNumber.toLowerCase() === body.rollNumber.toLowerCase())
					if (duplicate) { sendJson(response, 409, { message: 'This roll number is already marked present.' }); return }
					const entry = { ...body, id: Date.now(), markedAt: new Date().toISOString() }
					await saveDailyAttendance(sharedState.session, entry)
					sharedState.attendance.unshift(entry)
					sendJson(response, 200, sharedState)
					return
				}
				next()
			})
		},
	}
}

export default defineConfig({ plugins: [attendanceApi(), react()] })