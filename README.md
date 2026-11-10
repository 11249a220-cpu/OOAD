# RollCall QR Attendance

A React prototype for classroom attendance using a QR code that rotates every 10 seconds. Students enter their full name, roll number, and Kanchi University email address. The teacher can see the live register and export a CSV file.

Student emails must end with `@kanchiuniv.ac.in`. Submissions using another email domain are rejected and are not stored.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` on the teacher's computer. The development server also prints a network URL such as `http://192.168.0.225:5173/`.

## Use a phone for student check-in

1. Connect the phone and teacher's computer to the same Wi-Fi network.
2. Keep the terminal running `npm run dev`.
3. Start an attendance session on the teacher screen.
4. Scan the QR code with the phone.
5. Enter the student's full name, roll number, and email.

The normal app URL is teacher-only. The student form is shown only when opened through a QR link, and students cannot see the teacher console or end the session.

If the QR code cannot connect, open the printed network URL directly on the phone. If the computer's IP address changes, set it in `.env`:

```bash
VITE_PUBLIC_APP_URL=http://YOUR_COMPUTER_IP:5173
```

Restart `npm run dev` after changing `.env`.

## Use another computer

On the other computer, install Node.js 18 or newer, copy or clone this project, then run:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Use the URL printed by Vite in that computer's browser. A phone does not need Node.js or the project files; it only needs a browser and the same Wi-Fi connection.

## Safety limitations

The current shared register is a development API held in memory by the Vite server. It is intended for same-Wi-Fi testing only. Do not port-forward it, deploy it publicly, or use it for official attendance yet. Restarting the server clears the live register, but the daily JSON files remain on disk. The production version should use Firebase Authentication, Firestore security rules, and server-side QR token validation.

Each submitted attendee is also saved locally by the development server in a folder named `attendance/<subject_name>_<DD-MM-YYYY>/`, for example `attendance/Class_attendance_08-11-2026/`. The student list is stored in `students.json` inside that folder. The JSON stores the date as `DD/MM/YYYY`. These local attendance folders are ignored by Git so student data is not uploaded to GitHub.

## Test data

The 20 names used during testing are not part of the application code. To create a clean session, start a new session from the teacher console. Test submissions must use emails ending in `@kanchiuniv.ac.in`; Gmail and other domains are rejected.

## Firebase next step

The cloud version should replace the local storage functions in `src/main.jsx` with Firestore reads/writes and server-side token validation. Keep Firebase web configuration in environment variables and never commit service-account credentials. The `.env.example` file lists the expected public web-app variables.

## Build

```bash
npm run build
```