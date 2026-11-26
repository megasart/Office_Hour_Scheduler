require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const pool = require("./db");
const { GoogleGenAI } = require("@google/genai");

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        : undefined
    })
  : null;

const app = express();
const PORT = process.env.PORT || 3000;
const requestBuckets = new Map();

async function ensureDatabaseSchema() {
  await pool.query(`
    ALTER TABLE office_hours
      ADD COLUMN IF NOT EXISTS specific_date DATE,
      ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS meeting_link TEXT
  `);

  await pool.query(`
    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS student_name TEXT,
      ADD COLUMN IF NOT EXISTS student_email TEXT,
      ADD COLUMN IF NOT EXISTS preferred_language TEXT,
      ADD COLUMN IF NOT EXISTS scheduled_date DATE,
      ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'New',
      ADD COLUMN IF NOT EXISTS decline_reason TEXT,
      ADD COLUMN IF NOT EXISTS requested_office_hour_id INTEGER,
      ADD COLUMN IF NOT EXISTS requested_scheduled_date DATE,
      ADD COLUMN IF NOT EXISTS management_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS management_token_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_participants (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      participant_role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS appointments_management_token_idx
      ON appointments (management_token_hash)
  `);
}

async function sendMeetingEmail({
  to,
  subject,
  text,
  appointment,
  officeHour
}) {
  if (!mailer || !to) {
    console.warn(
      "Email not sent. Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM."
    );
    return;
  }

  const message = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text
  };

  if (appointment && officeHour && appointment.scheduled_date) {
    const date = String(appointment.scheduled_date)
      .slice(0, 10)
      .replace(/-/g, "");
    const startTime = String(officeHour.start_time)
      .slice(0, 5)
      .replace(":", "");
    const endTime = String(officeHour.end_time)
      .slice(0, 5)
      .replace(":", "");
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const calendarInvite = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Office Hour Scheduler//EN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:appointment-" + appointment.id + "@office-hour-scheduler",
      "DTSTAMP:" + stamp,
      "DTSTART;TZID=" + (officeHour.time_zone || "America/Los_Angeles") + ":" + date + "T" + startTime + "00",
      "DTEND;TZID=" + (officeHour.time_zone || "America/Los_Angeles") + ":" + date + "T" + endTime + "00",
      "SUMMARY:" + officeHour.course_name + " office hour with " + officeHour.instructor_name,
      "LOCATION:" + officeHour.location,
      officeHour.meeting_link
        ? "DESCRIPTION:Meeting link: " + officeHour.meeting_link
        : "DESCRIPTION:Office-hour appointment",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    message.attachments = [
      {
        filename: "office-hour.ics",
        content: calendarInvite,
        contentType: "text/calendar; charset=utf-8"
      }
    ];
  }

  await mailer.sendMail(message);
}

function normalizedEmail(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(dateValue + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOfWeekForDate(dateValue) {
  return new Date(dateValue + "T12:00:00Z").toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      timeZone: "UTC"
    }
  );
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Date(String(dateValue).slice(0, 10) + "T12:00:00Z")
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
}

function createManagementToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: crypto
      .createHash("sha256")
      .update(token)
      .digest("hex"),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 72)
  };
}

function hashManagementToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function managementUrl(token) {
  const baseUrl = (
    process.env.APP_BASE_URL ||
    "http://localhost:" + PORT
  ).replace(/\/$/, "");

  return baseUrl + "/manage/" + token;
}

function officeHourDate(officeHour) {
  return officeHour.specific_date
    ? String(officeHour.specific_date).slice(0, 10)
    : "";
}

function validateScheduleDate(officeHour, scheduledDate) {
  if (!validDate(scheduledDate) || scheduledDate < todayIso()) {
    return "Please choose a current or future meeting date.";
  }

  if (
    officeHour.specific_date &&
    officeHourDate(officeHour) !== scheduledDate
  ) {
    return "That office hour is only available on its listed date.";
  }

  if (
    !officeHour.specific_date &&
    officeHour.day_of_week !== dayOfWeekForDate(scheduledDate)
  ) {
    return "The selected date does not match the office hour day.";
  }

  return null;
}

function normalizeParticipants(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (!Array.isArray(value) || value.length > 5) {
    throw new Error("You may add up to five participants.");
  }

  return value.map((participant) => {
    const name =
      typeof participant.name === "string"
        ? participant.name.trim()
        : "";
    const email = normalizedEmail(participant.email);
    const role = participant.role;

    if (
      name.length === 0 ||
      name.length > 100 ||
      !validEmail(email) ||
      !["Assistant staff", "Student"].includes(role)
    ) {
      throw new Error("Each participant needs a valid name, email, and role.");
    }

    return {
      name,
      email,
      role
    };
  });
}

async function rotateManagementToken(appointmentId) {
  const tokenDetails = createManagementToken();
  await pool.query(
    `
      UPDATE appointments
      SET management_token_hash = $1,
          management_token_expires_at = $2
      WHERE id = $3
    `,
    [
      tokenDetails.tokenHash,
      tokenDetails.expiresAt,
      appointmentId
    ]
  );
  return tokenDetails.token;
}
async function analyzeAppointment(assignment, problemDescription) {
  const response = await gemini.models.generateContent({
    model:
      process.env.GEMINI_MODEL ||
      "gemini-3.1-flash-lite",

    contents: `
Act as an office-hour preparation assistant for a university.
The student user is going to send a request and you will summarize the student's problem.
Do not complete or solve the student's assignment.

Return:
1. A short summary of the student's problem.
2. The likely topic.
3. Three questions the student could discuss with the teacher.

Assignment:
${assignment}

Problem description:
${problemDescription}
`,

    config: {
      responseMimeType: "application/json",

      responseJsonSchema: {
        type: "object",
        properties: {
          summary: {
            type: "string"
          },
          topic: {
            type: "string"
          },
          suggestedQuestions: {
            type: "array",
            items: {
              type: "string"
            }
          }
        },
        required: [
          "summary",
          "topic",
          "suggestedQuestions"
        ]
      }
    }
  });
  if (!response.text) {
    throw new Error("Gemini returned no analysis.");
  }

  return JSON.parse(response.text);
}

app.use(express.json());

app.set("trust proxy", 1);

function rateLimit(limit, windowMs) {
  return (request, response, next) => {
    const key = request.ip + ":" + request.path;
    const now = Date.now();
    const bucket = requestBuckets.get(key) || {
      count: 0,
      resetAt: now + windowMs
    };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    requestBuckets.set(key, bucket);

    if (bucket.count > limit) {
      return response.status(429).json({
        error: "Too many requests. Please try again later."
      });
    }

    next();
  };
}

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/teacher/:slug", (request, response) => {
  response.sendFile(
    path.join(__dirname, "public", "teacher-profile.html")
  );
});

app.get("/api/teachers/:slug", async (request, response) => {
  const { slug } = request.params;

  try {
    const teacherResult = await pool.query(
      `
        SELECT
          id,
          display_name,
          teacher_slug
        FROM app_users
        WHERE teacher_slug = $1
          AND role = 'teacher'
      `,
      [slug]
    );

    if (teacherResult.rowCount === 0) {
      return response.status(404).json({
        error: "Teacher profile not found."
      });
    }

    const teacher = teacherResult.rows[0];

    const officeHourResult = await pool.query(
      `
        SELECT
          id,
          course_name,
          instructor_name,
          day_of_week,
          start_time,
          end_time,
          location,
          meeting_mode,
          specific_date,
          time_zone,
          capacity,
          meeting_link,
          is_available
        FROM office_hours
        WHERE teacher_id = $1
          AND is_available = true
        ORDER BY id
      `,
      [teacher.id]
    );

    response.json({
      teacher,
      officeHours: officeHourResult.rows
    });
  } catch (error) {
    console.error(
      "Could not load teacher profile:",
      error.message
    );

    response.status(500).json({
      error: "Teacher profile could not be loaded."
    });
  }
});

function readOfficeHourInput(body) {
  const scheduleType =
    body.scheduleType === "one-time"
      ? "one-time"
      : "recurring";
  const specificDate =
    typeof body.specificDate === "string" &&
    body.specificDate.trim() !== ""
      ? body.specificDate.trim()
      : null;
  const capacity = Number(body.capacity || 1);
  const timeZone =
    typeof body.timeZone === "string" &&
    body.timeZone.trim() !== ""
      ? body.timeZone.trim()
      : "America/Los_Angeles";
  const meetingLink =
    typeof body.meetingLink === "string"
      ? body.meetingLink.trim()
      : "";

  if (
    typeof body.courseName !== "string" ||
    body.courseName.trim() === "" ||
    body.courseName.length > 120 ||
    typeof body.startTime !== "string" ||
    typeof body.endTime !== "string" ||
    body.startTime >= body.endTime ||
    typeof body.location !== "string" ||
    body.location.trim() === "" ||
    body.location.length > 200 ||
    !["In-person", "Zoom", "Both"].includes(body.meetingMode) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 100
  ) {
    return {
      error: "Please complete all office-hour fields correctly."
    };
  }

  if (scheduleType === "one-time") {
    if (!validDate(specificDate) || specificDate < todayIso()) {
      return {
        error: "One-time office hours need a current or future date."
      };
    }
  } else if (specificDate !== null) {
    return {
      error: "Recurring office hours should not include a specific date."
    };
  }

  const dayOfWeek = specificDate
    ? dayOfWeekForDate(specificDate)
    : body.dayOfWeek;

  if (!["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(dayOfWeek)) {
    return {
      error: "Please select a valid weekday."
    };
  }

  return {
    value: {
      courseName: body.courseName.trim(),
      dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      location: body.location.trim(),
      meetingMode: body.meetingMode,
      specificDate,
      timeZone,
      capacity,
      meetingLink
    }
  };
}

app.post(
  "/api/appointments",
  rateLimit(12, 60 * 60 * 1000),
  async (request, response) => {
    const {
      officeHourId,
      scheduledDate,
      studentName,
      studentEmail,
      preferredLanguage,
      assignment,
      problemDescription,
      meetingType,
      participants,
      website
    } = request.body;
    const numericOfficeHourId = Number(officeHourId);
    const email = normalizedEmail(studentEmail);

    if (website) {
      return response.status(400).json({
        message: "The request could not be submitted."
      });
    }

    if (
      !Number.isInteger(numericOfficeHourId) ||
      typeof scheduledDate !== "string" ||
      typeof studentName !== "string" ||
      studentName.trim() === "" ||
      studentName.length > 100 ||
      !validEmail(email) ||
      (preferredLanguage !== undefined &&
        (typeof preferredLanguage !== "string" ||
          preferredLanguage.length > 80)) ||
      typeof assignment !== "string" ||
      assignment.trim() === "" ||
      assignment.length > 200 ||
      typeof problemDescription !== "string" ||
      problemDescription.trim() === "" ||
      problemDescription.length > 5000 ||
      !["In-person", "Zoom"].includes(meetingType)
    ) {
      return response.status(400).json({
        message: "Please complete all appointment fields correctly."
      });
    }

    let normalizedParticipants;
    try {
      normalizedParticipants = normalizeParticipants(participants);
    } catch (error) {
      return response.status(400).json({
        message: error.message
      });
    }

    let aiAnalysis = {
      summary: null,
      topic: null,
      suggestedQuestions: []
    };

    try {
      aiAnalysis = await analyzeAppointment(
        assignment.trim(),
        problemDescription.trim()
      );
    } catch (aiError) {
      console.error("AI analysis failed:", aiError.message);
    }

    const aiSuggestedQuestions = Array.isArray(
      aiAnalysis.suggestedQuestions
    )
      ? aiAnalysis.suggestedQuestions
          .map((question, index) => (index + 1) + ". " + question)
          .join("\n")
      : null;
    const tokenDetails = createManagementToken();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const officeHourResult = await client.query(
        "SELECT * FROM office_hours " +
        "WHERE id = $1 AND is_available = true FOR UPDATE",
        [numericOfficeHourId]
      );
      const officeHour = officeHourResult.rows[0];

      if (!officeHour) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          message: "The selected office hour is not available."
        });
      }

      const dateError = validateScheduleDate(
        officeHour,
        scheduledDate
      );
      if (dateError) {
        await client.query("ROLLBACK");
        return response.status(400).json({
          message: dateError
        });
      }

      const bookedResult = await client.query(
        "SELECT COUNT(*)::int AS booked_count " +
        "FROM appointments " +
        "WHERE office_hour_id = $1 AND scheduled_date = $2 " +
        "AND status IN ('Pending', 'Approved')",
        [
          numericOfficeHourId,
          scheduledDate
        ]
      );
      if (
        bookedResult.rows[0].booked_count >=
        Number(officeHour.capacity || 1)
      ) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          message: "That office-hour time is no longer available."
        });
      }

      const guestPassword = await bcrypt.hash(
        crypto.randomUUID(),
        10
      );
      const guestUser = await client.query(
        "INSERT INTO app_users " +
        "(username, password_hash, role, display_name) " +
        "VALUES ($1, $2, 'student', $3) " +
        "ON CONFLICT (username) " +
        "DO UPDATE SET display_name = EXCLUDED.display_name " +
        "RETURNING id",
        [
          "guest:" + email,
          guestPassword,
          studentName.trim()
        ]
      );
      const result = await client.query(
        "INSERT INTO appointments " +
        "(office_hour_id, student_id, student_name, student_email, " +
        "preferred_language, " +
        "scheduled_date, assignment, problem_description, meeting_type, " +
        "ai_summary, ai_topic, ai_suggested_questions, request_kind, " +
        "management_token_hash, management_token_expires_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'New', $13, $14) " +
        "RETURNING id, status, created_at",
        [
          numericOfficeHourId,
          guestUser.rows[0].id,
          studentName.trim(),
          email,
          typeof preferredLanguage === "string"
            ? preferredLanguage.trim()
            : "",
          scheduledDate,
          assignment.trim(),
          problemDescription.trim(),
          meetingType,
          aiAnalysis.summary,
          aiAnalysis.topic,
          aiSuggestedQuestions,
          tokenDetails.tokenHash,
          tokenDetails.expiresAt
        ]
      );

      for (const participant of normalizedParticipants) {
        await client.query(
          "INSERT INTO appointment_participants " +
          "(appointment_id, name, email, participant_role) " +
          "VALUES ($1, $2, $3, $4)",
          [
            result.rows[0].id,
            participant.name,
            participant.email,
            participant.role
          ]
        );
      }

      await client.query("COMMIT");
      const details = await pool.query(
        "SELECT a.*, oh.course_name, oh.instructor_name, " +
        "oh.start_time, oh.end_time, oh.location, oh.meeting_mode, " +
        "oh.time_zone, oh.meeting_link " +
        "FROM appointments a JOIN office_hours oh " +
        "ON a.office_hour_id = oh.id WHERE a.id = $1",
        [result.rows[0].id]
      );
      const appointment = details.rows[0];
      const manageLink = managementUrl(tokenDetails.token);

      sendMeetingEmail({
        to: email,
        subject: "Office-hour request received",
        appointment,
        officeHour: appointment,
        text: [
          "Hi " + studentName.trim() + ",",
          "",
          "Your office-hour request has been submitted for review.",
          "Course: " + appointment.course_name,
          "Teacher: " + appointment.instructor_name,
          "Date: " + formatDate(appointment.scheduled_date),
          "Time: " + appointment.start_time + " - " + appointment.end_time,
          "Location: " + appointment.location + " / " + appointment.meeting_mode,
          "",
          "Manage your request: " + manageLink,
          "",
          "You will receive another email when the teacher responds."
        ].join("\n")
      }).catch((emailError) => {
        console.error("Could not send booking email:", emailError.message);
      });

      response.status(201).json({
        message: "Your appointment request was submitted for review.",
        manageUrl: mailer ? null : manageLink,
        appointment: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Appointment request failed:", error.message);
      response.status(500).json({
        message: "The appointment request could not be saved."
      });
    } finally {
      client.release();
    }
  }
);

app.post(
  "/api/improve-question",
  rateLimit(20, 15 * 60 * 1000),
  async (request, response) => {
    const {
      assignment,
      problemDescription
    } = request.body;

    if (
      typeof assignment !== "string" ||
      assignment.trim() === "" ||
      typeof problemDescription !== "string" ||
      problemDescription.trim() === ""
    ) {
      return response.status(400).json({
        message: "Please enter an assignment and question first."
      });
    }

    try {
      const aiResponse =
        await gemini.models.generateContent({
          model:
            process.env.GEMINI_MODEL ||
            "gemini-3.1-flash-lite",

          contents: `
You are a university office-hour question-refinement assistant.
Whenever a student enters a question, suggest a clearer
version of the question and explain why it is better.

The improved question should:
- identify the assignment or topic,
- describe what the student already tried if provided,
- identify the exact confusion,
- clearly state what help the student needs.

Do not invent information.
Do not solve the assignment.
Preserve the student's original meaning.

Assignment:
${assignment.trim()}

Original student question:
${problemDescription.trim()}
`,

          config: {
            responseMimeType: "application/json",

            responseJsonSchema: {
              type: "object",
              properties: {
                improvedQuestion: {
                  type: "string"
                },
                reason: {
                  type: "string"
                }
              },
              required: [
                "improvedQuestion",
                "reason"
              ]
            }
          }
        });

      if (!aiResponse.text) {
        throw new Error(
          "Gemini returned no improved question."
        );
      }

      const result = JSON.parse(aiResponse.text);

      response.json({
        originalQuestion: problemDescription.trim(),
        improvedQuestion: result.improvedQuestion,
        reason: result.reason
      });
    } catch (error) {
      console.error(
        "Question improvement failed:",
        error.message
      );

      response.status(500).json({
        message:
          "The AI could not improve the question right now."
      });
    }
  }
);

function requireRole(role) {
  return (request, response, next) => {
    if (!request.session.user) {
      return response.status(401).json({
        error: "You must be logged in."
      });
    }

    if (request.session.user.role !== role) {
      return response.status(403).json({
        error: "You do not have permission to perform this action."
      });
    }

    next();
  };
}

app.post("/api/login", async (request, response) => {
  const { username, password } = request.body;

  if (!username || !password) {
    return response.status(400).json({
      error: "Username and password are required."
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          username,
          password_hash,
          role,
          display_name,
          teacher_slug
        FROM app_users
        WHERE username = $1
      `,
      [username.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      return response.status(401).json({
        error: "Invalid username or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return response.status(401).json({
        error: "Invalid username or password."
      });
    }

    request.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      teacherSlug: user.teacher_slug
    };

    response.json({
      message: "Login successful.",
      user: request.session.user
    });
  } catch (error) {
    console.error("Login error:", error);

    response.status(500).json({
      error: "Login failed."
    });
  }
});

app.get("/api/me", (request, response) => {
  if (!request.session.user) {
    return response.status(401).json({
      error: "You are not logged in."
    });
  }

  response.json({
    user: request.session.user
  });
});

app.post("/api/logout", (request, response) => {
  request.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);

      return response.status(500).json({
        error: "Logout failed."
      });
    }

    response.clearCookie("connect.sid");

    response.json({
      message: "Logout successful."
    });
  });
});

app.get("/api/health", async (request, response) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    response.json({
      status: "ok",
      database: "connected",
      time: result.rows[0].current_time
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    response.status(500).json({
      status: "error",
      database: "not connected"
    });
  }
});

app.get(
  "/api/office-hours",
  requireRole("teacher"),
  async (request, response) => {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            course_name,
            instructor_name,
            day_of_week,
            start_time,
            end_time,
            location,
            meeting_mode,
            specific_date,
            time_zone,
            capacity,
            meeting_link,
            is_available
          FROM office_hours
          WHERE teacher_id = $1
          ORDER BY id
        `,
        [request.session.user.id]
      );

      response.json(result.rows);
    } catch (error) {
      console.error("Could not load office hours:", error.message);

      response.status(500).json({
        error: "Office hours could not be loaded."
      });
    }
  }
);

app.get(
  "/api/available-office-hours",
  async (request, response) => {
    try {
      const officeHourResult = await pool.query(
        `
          SELECT
            office_hours.id,
            office_hours.course_name,
            office_hours.instructor_name,
            office_hours.day_of_week,
            office_hours.start_time,
            office_hours.end_time,
            office_hours.location,
            office_hours.meeting_mode,
            office_hours.specific_date,
            office_hours.time_zone,
            office_hours.capacity,
            office_hours.meeting_link,
            office_hours.is_available,
            app_users.teacher_slug
          FROM office_hours
          JOIN app_users
            ON office_hours.teacher_id = app_users.id
          WHERE office_hours.is_available = true
        `
      );

      const bookedResult = await pool.query(
        `
          SELECT office_hour_id, scheduled_date, COUNT(*)::int AS booked_count
          FROM appointments
          WHERE status IN ('Pending', 'Approved')
            AND scheduled_date IS NOT NULL
          GROUP BY office_hour_id, scheduled_date
        `
      );
      const booked = new Map(
        bookedResult.rows.map((row) => [
          row.office_hour_id + ":" +
            String(row.scheduled_date).slice(0, 10),
          row.booked_count
        ])
      );
      const available = [];

      officeHourResult.rows.forEach((officeHour) => {
        const dates = [];
        if (officeHour.specific_date) {
          const date = officeHourDate(officeHour);
          if (date >= todayIso()) {
            dates.push(date);
          }
        } else {
          for (let offset = 0; offset < 35; offset += 1) {
            const date = addDays(todayIso(), offset);
            if (dayOfWeekForDate(date) === officeHour.day_of_week) {
              dates.push(date);
            }
          }
        }

        dates.forEach((date) => {
          const bookedCount =
            booked.get(officeHour.id + ":" + date) || 0;
          if (bookedCount < Number(officeHour.capacity || 1)) {
            available.push({
              ...officeHour,
              availability_date: date,
              booked_count: bookedCount
            });
          }
        });
      });

      available.sort((a, b) =>
        (a.availability_date + "T" + a.start_time).localeCompare(
          b.availability_date + "T" + b.start_time
        )
      );
      response.json(available);
    } catch (error) {
      console.error(
        "Could not load available office hours:",
        error.message
      );

      response.status(500).json({
        error: "Available office hours could not be loaded."
      });
    }
  }
);

app.post(
  "/api/office-hours",
  requireRole("teacher"),
  async (request, response) => {
    const input = readOfficeHourInput(request.body);
    if (input.error) {
      return response.status(400).json({
        error: input.error
      });
    }

    try {
      const result = await pool.query(
        `
          INSERT INTO office_hours (
            teacher_id,
            course_name,
            instructor_name,
            day_of_week,
            start_time,
            end_time,
            location,
            meeting_mode,
            specific_date,
            time_zone,
            capacity,
            meeting_link,
            is_available
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
          RETURNING *
        `,
        [
          request.session.user.id,
          input.value.courseName,
          request.session.user.displayName,
          input.value.dayOfWeek,
          input.value.startTime,
          input.value.endTime,
          input.value.location,
          input.value.meetingMode,
          input.value.specificDate,
          input.value.timeZone,
          input.value.capacity,
          input.value.meetingLink || null
        ]
      );

      response.status(201).json({
        message: "Office hour created successfully.",
        officeHour: result.rows[0]
      });
    } catch (error) {
      console.error("Could not create office hour:", error.message);

      response.status(500).json({
        error: "Office hour could not be created."
      });
    }
  }
);

async function sendUpcomingMeetingReminders() {
  if (!mailer) {
    return;
  }

  const result = await pool.query(
    "SELECT a.id, a.student_name, a.student_email, a.scheduled_date, " +
    "oh.course_name, oh.instructor_name, oh.start_time, oh.end_time, " +
    "oh.location, oh.meeting_mode, oh.time_zone, oh.meeting_link " +
    "FROM appointments a JOIN office_hours oh " +
    "ON a.office_hour_id = oh.id " +
    "WHERE a.status = 'Approved' " +
    "AND a.scheduled_date = CURRENT_DATE + 1 " +
    "AND a.reminder_sent_at IS NULL"
  );

  for (const appointment of result.rows) {
    const token = await rotateManagementToken(appointment.id);
    await sendMeetingEmail({
      to: appointment.student_email,
      subject: "Office-hour reminder for tomorrow",
      appointment,
      officeHour: appointment,
      text: [
        "Hi " + (appointment.student_name || "there") + ",",
        "",
        "This is a reminder about your office-hour meeting tomorrow.",
        "Course: " + appointment.course_name,
        "Teacher: " + appointment.instructor_name,
        "Date: " + formatDate(appointment.scheduled_date),
        "Time: " + appointment.start_time + " - " + appointment.end_time,
        "Location: " + appointment.location + " / " + appointment.meeting_mode,
        appointment.meeting_link
          ? "Meeting link: " + appointment.meeting_link
          : "",
        "",
        "Manage your request: " + managementUrl(token)
      ].join("\n")
    });
    await pool.query(
      "UPDATE appointments SET reminder_sent_at = NOW() WHERE id = $1",
      [appointment.id]
    );
  }
}

app.patch(
  "/api/office-hours/:id",
  requireRole("teacher"),
  async (request, response) => {
    const officeHourId = Number(request.params.id);
    const input = readOfficeHourInput(request.body);
    if (!Number.isInteger(officeHourId) || input.error) {
      return response.status(400).json({
        error: input.error || "Invalid office-hour ID."
      });
    }

    try {
      const result = await pool.query(
        "UPDATE office_hours\n" +
        "SET course_name = $1, day_of_week = $2, start_time = $3,\n" +
        "    end_time = $4, location = $5, meeting_mode = $6,\n" +
        "    specific_date = $7, time_zone = $8, capacity = $9,\n" +
        "    meeting_link = $10\n" +
        "WHERE id = $11 AND teacher_id = $12\n" +
        "RETURNING *",
        [
          input.value.courseName,
          input.value.dayOfWeek,
          input.value.startTime,
          input.value.endTime,
          input.value.location,
          input.value.meetingMode,
          input.value.specificDate,
          input.value.timeZone,
          input.value.capacity,
          input.value.meetingLink || null,
          officeHourId,
          request.session.user.id
        ]
      );

      if (result.rowCount === 0) {
        return response.status(404).json({
          error: "Office hour not found."
        });
      }

      response.json({
        message: "Office hour updated successfully.",
        officeHour: result.rows[0]
      });
    } catch (error) {
      console.error("Could not update office hour:", error.message);
      response.status(500).json({
        error: "Office hour could not be updated."
      });
    }
  }
);

app.delete(
  "/api/office-hours/:id",
  requireRole("teacher"),
  async (request, response) => {
    const officeHourId = Number(request.params.id);
    if (!Number.isInteger(officeHourId)) {
      return response.status(400).json({
        error: "Invalid office-hour ID."
      });
    }

    try {
      const result = await pool.query(
        "UPDATE office_hours\n" +
        "SET is_available = false\n" +
        "WHERE id = $1 AND teacher_id = $2\n" +
        "RETURNING id",
        [
          officeHourId,
          request.session.user.id
        ]
      );

      if (result.rowCount === 0) {
        return response.status(404).json({
          error: "Office hour not found."
        });
      }

      response.json({
        message: "Office hour paused."
      });
    } catch (error) {
      console.error("Could not pause office hour:", error.message);
      response.status(500).json({
        error: "Office hour could not be paused."
      });
    }
  }
);

app.post(
  "/api/appointments",
  async (request, response) => {
    const {
      officeHourId,
      studentName,
      studentEmail,
      assignment,
      problemDescription,
      meetingType
    } = request.body;

    const numericOfficeHourId = Number(officeHourId);
    const validMeetingTypes = ["In-person", "Zoom"];
    const normalizedEmail =
      typeof studentEmail === "string"
        ? studentEmail.trim().toLowerCase()
        : "";

    if (
      !Number.isInteger(numericOfficeHourId) ||
      typeof studentName !== "string" ||
      studentName.trim() === "" ||
      !/^\S+@\S+\.\S+$/.test(normalizedEmail) ||
      typeof assignment !== "string" ||
      assignment.trim() === "" ||
      typeof problemDescription !== "string" ||
      problemDescription.trim() === "" ||
      !validMeetingTypes.includes(meetingType)
    ) {
      return response.status(400).json({
        message: "Please complete all appointment fields."
      });
    }

    try {
      const officeHour = await pool.query(
        `
          SELECT id
          FROM office_hours
          WHERE id = $1
            AND is_available = true
        `,
        [numericOfficeHourId]
      );

      if (officeHour.rowCount === 0) {
        return response.status(404).json({
          message: "The selected office hour is not available."
        });
      }

      const guestPassword = await bcrypt.hash(
        crypto.randomUUID(),
        10
      );

      const guestUser = await pool.query(
        `
          INSERT INTO app_users (
            username,
            password_hash,
            role,
            display_name
          )
          VALUES ($1, $2, 'student', $3)
          ON CONFLICT (username)
          DO UPDATE SET display_name = EXCLUDED.display_name
          RETURNING id
        `,
        [
          `guest:${normalizedEmail}`,
          guestPassword,
          studentName.trim()
        ]
      );

      let aiAnalysis = {
        summary: null,
        topic: null,
        suggestedQuestions: []
      };

      try {
        aiAnalysis = await analyzeAppointment(
          assignment.trim(),
          problemDescription.trim()
        );
      } catch (aiError) {
        console.error("AI analysis failed:", aiError.message);
      }

      const aiSuggestedQuestions = Array.isArray(
        aiAnalysis.suggestedQuestions
      )
        ? aiAnalysis.suggestedQuestions
            .map((question, index) => `${index + 1}. ${question}`)
            .join("\n")
        : null;

      const result = await pool.query(
        `
          INSERT INTO appointments (
            office_hour_id,
            student_id,
            student_name,
            student_email,
            assignment,
            problem_description,
            meeting_type,
            ai_summary,
            ai_topic,
            ai_suggested_questions
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING
            id,
            status,
            created_at,
            ai_summary,
            ai_topic,
            ai_suggested_questions
        `,
        [
          numericOfficeHourId,
          guestUser.rows[0].id,
          studentName.trim(),
          normalizedEmail,
          assignment.trim(),
          problemDescription.trim(),
          meetingType,
          aiAnalysis.summary,
          aiAnalysis.topic,
          aiSuggestedQuestions
        ]
      );

      const officeHourDetails = await pool.query(
        `
          SELECT course_name, instructor_name, day_of_week,
            start_time, end_time, location, meeting_mode
          FROM office_hours
          WHERE id = $1
        `,
        [numericOfficeHourId]
      );

      const bookedOfficeHour = officeHourDetails.rows[0];

      sendMeetingEmail({
        to: normalizedEmail,
        subject: "Office-hour request received",
        text: [
          `Hi ${studentName.trim()},`,
          "",
          "Your office-hour request has been submitted for review.",
          `Course: ${bookedOfficeHour.course_name}`,
          `Teacher: ${bookedOfficeHour.instructor_name}`,
          `Time: ${bookedOfficeHour.day_of_week}, ${bookedOfficeHour.start_time} - ${bookedOfficeHour.end_time}`,
          `Location: ${bookedOfficeHour.location} / ${bookedOfficeHour.meeting_mode}`,
          "",
          "You will receive another email when the teacher approves or declines it."
        ].join("\n")
      }).catch((emailError) => {
        console.error("Could not send booking email:", emailError.message);
      });

      response.status(201).json({
        message: "Your appointment request was submitted for review.",
        appointment: result.rows[0]
      });
    } catch (error) {
      console.error("Appointment request failed:", error.message);

      response.status(500).json({
        message: "The appointment request could not be saved."
      });
    }
  }
);

async function loadManagedAppointment(token) {
  const result = await pool.query(
    "SELECT a.*, oh.course_name, oh.instructor_name, oh.day_of_week, " +
    "oh.start_time, oh.end_time, oh.location, oh.meeting_mode, " +
    "oh.time_zone, oh.meeting_link " +
    "FROM appointments a JOIN office_hours oh " +
    "ON a.office_hour_id = oh.id " +
    "WHERE a.management_token_hash = $1",
    [hashManagementToken(token)]
  );
  const appointment = result.rows[0];

  if (!appointment) {
    return {
      status: 404,
      error: "This management link is invalid."
    };
  }

  if (
    appointment.management_token_expires_at &&
    new Date(appointment.management_token_expires_at) < new Date()
  ) {
    return {
      status: 410,
      error: "This management link has expired."
    };
  }

  const participantResult = await pool.query(
    "SELECT name, email, participant_role " +
    "FROM appointment_participants " +
    "WHERE appointment_id = $1 ORDER BY id",
    [appointment.id]
  );
  appointment.participants = participantResult.rows;
  return { appointment };
}

app.get("/manage/:token", (request, response) => {
  response.sendFile(
    path.join(__dirname, "public", "manage.html")
  );
});

app.get("/api/manage/:token", async (request, response) => {
  try {
    const result = await loadManagedAppointment(request.params.token);
    if (result.error) {
      return response.status(result.status).json({
        error: result.error
      });
    }
    response.json(result.appointment);
  } catch (error) {
    console.error("Could not load managed appointment:", error.message);
    response.status(500).json({
      error: "The appointment could not be loaded."
    });
  }
});

app.post("/api/manage/:token/cancel", async (request, response) => {
  try {
    const result = await loadManagedAppointment(request.params.token);
    if (result.error) {
      return response.status(result.status).json({
        error: result.error
      });
    }
    const appointment = result.appointment;
    if (!["Pending", "Approved"].includes(appointment.status)) {
      return response.status(409).json({
        error: "This appointment cannot be cancelled in its current state."
      });
    }

    await pool.query(
      "UPDATE appointments SET status = 'Cancelled', " +
      "decline_reason = NULL WHERE id = $1",
      [appointment.id]
    );
    const newToken = await rotateManagementToken(appointment.id);
    sendMeetingEmail({
      to: appointment.student_email,
      subject: "Office-hour appointment cancelled",
      text: [
        "Hi " + (appointment.student_name || "there") + ",",
        "",
        "Your office-hour appointment has been cancelled.",
        "Manage your request: " + managementUrl(newToken)
      ].join("\n")
    }).catch((emailError) => {
      console.error("Could not send cancellation email:", emailError.message);
    });
    response.json({
      message: "Appointment cancelled."
    });
  } catch (error) {
    console.error("Could not cancel appointment:", error.message);
    response.status(500).json({
      error: "The appointment could not be cancelled."
    });
  }
});

app.post("/api/manage/:token/reschedule", async (request, response) => {
  const newOfficeHourId = Number(request.body.officeHourId);
  const newScheduledDate = request.body.scheduledDate;
  if (
    !Number.isInteger(newOfficeHourId) ||
    typeof newScheduledDate !== "string"
  ) {
    return response.status(400).json({
      error: "Choose a new office-hour time."
    });
  }

  try {
    const result = await loadManagedAppointment(request.params.token);
    if (result.error) {
      return response.status(result.status).json({
        error: result.error
      });
    }
    const appointment = result.appointment;
    if (!["Pending", "Approved"].includes(appointment.status)) {
      return response.status(409).json({
        error: "This appointment cannot be rescheduled in its current state."
      });
    }

    const officeHourResult = await pool.query(
      "SELECT * FROM office_hours " +
      "WHERE id = $1 AND is_available = true",
      [newOfficeHourId]
    );
    const officeHour = officeHourResult.rows[0];
    if (!officeHour) {
      return response.status(404).json({
        error: "The selected office hour is not available."
      });
    }

    const dateError = validateScheduleDate(
      officeHour,
      newScheduledDate
    );
    if (dateError) {
      return response.status(400).json({
        error: dateError
      });
    }

    const bookedResult = await pool.query(
      "SELECT COUNT(*)::int AS booked_count FROM appointments " +
      "WHERE office_hour_id = $1 AND scheduled_date = $2 " +
      "AND status IN ('Pending', 'Approved') " +
      "AND id <> $3",
      [
        newOfficeHourId,
        newScheduledDate,
        appointment.id
      ]
    );
    if (
      bookedResult.rows[0].booked_count >=
      Number(officeHour.capacity || 1)
    ) {
      return response.status(409).json({
        error: "That office-hour time is no longer available."
      });
    }

    await pool.query(
      "UPDATE appointments SET status = 'Pending', " +
      "request_kind = 'Reschedule', requested_office_hour_id = $1, " +
      "requested_scheduled_date = $2, decline_reason = NULL " +
      "WHERE id = $3",
      [
        newOfficeHourId,
        newScheduledDate,
        appointment.id
      ]
    );
    const newToken = await rotateManagementToken(appointment.id);
    sendMeetingEmail({
      to: appointment.student_email,
      subject: "Reschedule request received",
      text: [
        "Hi " + (appointment.student_name || "there") + ",",
        "",
        "Your reschedule request was sent to the teacher for review.",
        "Requested date: " + formatDate(newScheduledDate),
        "Requested time: " + officeHour.start_time +
          " - " + officeHour.end_time,
        "Manage your request: " + managementUrl(newToken)
      ].join("\n")
    }).catch((emailError) => {
      console.error("Could not send reschedule email:", emailError.message);
    });
    response.json({
      message: "Your reschedule request was sent for review."
    });
  } catch (error) {
    console.error("Could not request reschedule:", error.message);
    response.status(500).json({
      error: "The appointment could not be rescheduled."
    });
  }
});

app.get(
  "/api/my-appointments",
  (request, response) => {
    response.status(410).json({
      error: "Use the secure management link from your email."
    });
  }
);

app.get(
  "/api/my-appointments",
  async (request, response) => {
    const studentEmail =
      typeof request.query.email === "string"
        ? request.query.email.trim().toLowerCase()
        : "";

    if (!/^\S+@\S+\.\S+$/.test(studentEmail)) {
      return response.status(400).json({
        error: "A valid email address is required."
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT
            appointments.id,
            appointments.student_name,
            appointments.student_email,
            appointments.assignment,
            appointments.problem_description,
            appointments.meeting_type,
            appointments.status,
            appointments.created_at,
            office_hours.course_name,
            office_hours.instructor_name,
            office_hours.day_of_week,
            office_hours.start_time,
            office_hours.end_time,
            office_hours.location,
            office_hours.meeting_mode
          FROM appointments
          JOIN office_hours
            ON appointments.office_hour_id = office_hours.id
          WHERE appointments.student_email = $1
          ORDER BY appointments.created_at DESC
        `,
        [studentEmail]
      );

      response.json(result.rows);
    } catch (error) {
      console.error(
        "Could not load student appointments:",
        error.message
      );

      response.status(500).json({
        error: "Your appointments could not be loaded."
      });
    }
  }
);

app.get(
  "/api/appointments",
  requireRole("teacher"),
  async (request, response) => {
    const requestedStatus = request.query.status;
    const validStatuses = [
      "Pending",
      "Approved",
      "Declined",
      "Cancelled"
    ];
    if (
      requestedStatus &&
      requestedStatus !== "All" &&
      !validStatuses.includes(requestedStatus)
    ) {
      return response.status(400).json({
        message: "Invalid appointment status."
      });
    }

    const values = [request.session.user.id];
    let query =
      "SELECT a.id, a.student_name, a.student_email, a.preferred_language, a.assignment, " +
      "a.problem_description, a.meeting_type, a.status, a.request_kind, " +
      "a.decline_reason, a.scheduled_date, a.created_at, " +
      "a.ai_summary, a.ai_topic, a.ai_suggested_questions, " +
      "oh.course_name, oh.instructor_name, oh.day_of_week, " +
      "oh.start_time, oh.end_time, oh.location, oh.meeting_mode, " +
      "oh.meeting_link, requested.course_name AS requested_course_name, " +
      "requested.day_of_week AS requested_day_of_week, " +
      "requested.start_time AS requested_start_time, " +
      "requested.end_time AS requested_end_time, " +
      "a.requested_scheduled_date " +
      "FROM appointments a " +
      "JOIN office_hours oh ON a.office_hour_id = oh.id " +
      "JOIN app_users teachers ON oh.teacher_id = teachers.id " +
      "LEFT JOIN office_hours requested " +
      "ON a.requested_office_hour_id = requested.id " +
      "WHERE teachers.id = $1";

    if (requestedStatus && requestedStatus !== "All") {
      query += " AND a.status = $2";
      values.push(requestedStatus);
    }
    query += " ORDER BY a.created_at DESC";

    try {
      const result = await pool.query(query, values);
      response.json(result.rows);
    } catch (error) {
      console.error("Could not load appointments:", error.message);
      response.status(500).json({
        message: "Appointments could not be loaded."
      });
    }
  }
);

app.get(
  "/api/appointments",
  requireRole("teacher"),
  async (request, response) => {
    const requestedStatus = request.query.status;
    const validStatuses = [
      "Pending",
      "Approved",
      "Declined"
    ];

    if (
      requestedStatus &&
      !validStatuses.includes(requestedStatus)
    ) {
      return response.status(400).json({
        message: "Invalid appointment status."
      });
    }

    const queryValues = [];

    let query = `
      SELECT
        appointments.id,
        appointments.student_name,
        appointments.student_email,
        appointments.assignment,
        appointments.problem_description,
        appointments.meeting_type,
        appointments.status,
        appointments.created_at,
        appointments.ai_summary,
        appointments.ai_topic,
        appointments.ai_suggested_questions,
        office_hours.course_name,
        office_hours.instructor_name,
        office_hours.day_of_week,
        office_hours.start_time,
        office_hours.end_time,
        office_hours.location
      FROM appointments
      JOIN office_hours
        ON appointments.office_hour_id = office_hours.id
    `;

    if (requestedStatus) {
      query += " WHERE appointments.status = $1";
      queryValues.push(requestedStatus);
    }

    query += " ORDER BY appointments.created_at DESC";

    try {
      const result = await pool.query(
        query,
        queryValues
      );

      response.json(result.rows);
    } catch (error) {
      console.error(
        "Could not load appointments:",
        error.message
      );

      response.status(500).json({
        message: "Appointments could not be loaded."
      });
    }
  }
);

app.patch(
  "/api/appointments/:id/status",
  requireRole("teacher"),
  async (request, response) => {
    const appointmentId = Number(request.params.id);
    const status = request.body.status;
    const declineReason =
      typeof request.body.declineReason === "string"
        ? request.body.declineReason.trim().slice(0, 500)
        : "";
    if (
      !Number.isInteger(appointmentId) ||
      !["Approved", "Declined"].includes(status)
    ) {
      return response.status(400).json({
        message: "Invalid appointment ID or status."
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        "SELECT a.*, oh.teacher_id FROM appointments a " +
        "JOIN office_hours oh ON a.office_hour_id = oh.id " +
        "WHERE a.id = $1 AND oh.teacher_id = $2 FOR UPDATE",
        [
          appointmentId,
          request.session.user.id
        ]
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return response.status(404).json({
          message: "Appointment not found."
        });
      }

      let nextStatus = status;
      let nextOfficeHourId = current.office_hour_id;
      let nextScheduledDate = current.scheduled_date;
      let nextReason = status === "Declined"
        ? declineReason || "The teacher declined this request."
        : null;

      if (
        current.request_kind === "Reschedule" &&
        status === "Approved"
      ) {
        nextOfficeHourId = current.requested_office_hour_id;
        nextScheduledDate = current.requested_scheduled_date;
      } else if (
        current.request_kind === "Reschedule" &&
        status === "Declined"
      ) {
        nextStatus = "Approved";
        nextReason =
          declineReason || "The reschedule request was declined.";
      }

      if (nextStatus === "Approved") {
        const capacityResult = await client.query(
          "SELECT capacity FROM office_hours WHERE id = $1 FOR UPDATE",
          [nextOfficeHourId]
        );
        const capacity = Number(
          capacityResult.rows[0] &&
          capacityResult.rows[0].capacity || 1
        );
        const bookedResult = await client.query(
          "SELECT COUNT(*)::int AS booked_count FROM appointments " +
          "WHERE office_hour_id = $1 AND scheduled_date = $2 " +
          "AND status = 'Approved' AND id <> $3",
          [
            nextOfficeHourId,
            nextScheduledDate,
            appointmentId
          ]
        );
        if (bookedResult.rows[0].booked_count >= capacity) {
          await client.query("ROLLBACK");
          return response.status(409).json({
            message: "That office-hour time is already full."
          });
        }
      }

      const tokenDetails = createManagementToken();
      const updateResult = await client.query(
        "UPDATE appointments SET status = $1, office_hour_id = $2, " +
        "scheduled_date = $3, request_kind = 'New', decline_reason = $4, " +
        "requested_office_hour_id = NULL, requested_scheduled_date = NULL, " +
        "management_token_hash = $5, management_token_expires_at = $6, " +
        "reminder_sent_at = NULL WHERE id = $7 " +
        "RETURNING id, student_name, student_email, status",
        [
          nextStatus,
          nextOfficeHourId,
          nextScheduledDate,
          nextReason,
          tokenDetails.tokenHash,
          tokenDetails.expiresAt,
          appointmentId
        ]
      );
      await client.query("COMMIT");

      const managed = await loadManagedAppointment(
        tokenDetails.token
      );
      const updated = managed.appointment;
      const rescheduleRequest =
        current.request_kind === "Reschedule";
      sendMeetingEmail({
        to: updated.student_email,
        subject: rescheduleRequest
          ? "Reschedule request " + status.toLowerCase()
          : "Office-hour request " + status.toLowerCase(),
        appointment: updated,
        officeHour: updated,
        text: [
          "Hi " + (updated.student_name || "there") + ",",
          "",
          rescheduleRequest
            ? status === "Approved"
              ? "Your reschedule request was approved."
              : "Your reschedule request was declined. Your original appointment remains unchanged."
            : "Your office-hour request was " + status.toLowerCase() + ".",
          updated.decline_reason
            ? "Message from the teacher: " + updated.decline_reason
            : "",
          "Course: " + updated.course_name,
          "Date: " + formatDate(updated.scheduled_date),
          "Time: " + updated.start_time + " - " + updated.end_time,
          "Location: " + updated.location + " / " + updated.meeting_mode,
          updated.meeting_link
            ? "Meeting link: " + updated.meeting_link
            : "",
          "",
          "Manage your request: " +
            managementUrl(tokenDetails.token)
        ].join("\n")
      }).catch((emailError) => {
        console.error("Could not send status email:", emailError.message);
      });

      if (nextStatus === "Approved" && updated.participants) {
        updated.participants.forEach((participant) => {
          sendMeetingEmail({
            to: participant.email,
            subject: "You were invited to an office-hour meeting",
            appointment: updated,
            officeHour: updated,
            text: [
              "Hi " + participant.name + ",",
              "",
              updated.student_name + " invited you to join an office-hour meeting.",
              "Course: " + updated.course_name,
              "Teacher: " + updated.instructor_name,
              "Date: " + formatDate(updated.scheduled_date),
              "Time: " + updated.start_time + " - " + updated.end_time,
              "Location: " + updated.location + " / " + updated.meeting_mode
            ].join("\n")
          }).catch((emailError) => {
            console.error("Could not send participant email:", emailError.message);
          });
        });
      }

      response.json({
        message: rescheduleRequest
          ? "Reschedule request " + status.toLowerCase() + "."
          : "Appointment request " + status.toLowerCase() + ".",
        appointment: updateResult.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Could not update appointment:", error.message);
      response.status(500).json({
        message: "Appointment status could not be updated."
      });
    } finally {
      client.release();
    }
  }
);

app.patch(
  "/api/appointments/:id/status",
  requireRole("teacher"),
  async (request, response) => {
    const appointmentId = Number(request.params.id);
    const { status } = request.body;
    const validStatuses = ["Approved", "Declined"];

    if (
      !Number.isInteger(appointmentId) ||
      !validStatuses.includes(status)
    ) {
      return response.status(400).json({
        message: "Invalid appointment ID or status."
      });
    }

    try {
      const result = await pool.query(
        `
          UPDATE appointments
          SET status = $1
          FROM office_hours
          WHERE appointments.id = $2
            AND appointments.office_hour_id = office_hours.id
            AND office_hours.teacher_id = $3
          RETURNING appointments.id, appointments.status,
            appointments.student_name, appointments.student_email,
            appointments.office_hour_id
        `,
        [
          status,
          appointmentId,
          request.session.user.id
        ]
      );

      if (result.rowCount === 0) {
        return response.status(404).json({
          message: "Appointment not found."
        });
      }

      const appointment = result.rows[0];

      const officeHourDetails = await pool.query(
        `
          SELECT course_name, instructor_name, day_of_week,
            start_time, end_time, location, meeting_mode
          FROM office_hours
          WHERE id = $1
        `,
        [appointment.office_hour_id]
      );

      const approvedOfficeHour = officeHourDetails.rows[0];

      sendMeetingEmail({
        to: appointment.student_email,
        subject: `Office-hour request ${status.toLowerCase()}`,
        text: [
          `Hi ${appointment.student_name || "there"},`,
          "",
          `Your office-hour request has been ${status.toLowerCase()}.`,
          approvedOfficeHour
            ? `Meeting: ${approvedOfficeHour.course_name} with ${approvedOfficeHour.instructor_name}`
            : "",
          approvedOfficeHour
            ? `Time: ${approvedOfficeHour.day_of_week}, ${approvedOfficeHour.start_time} - ${approvedOfficeHour.end_time}`
            : "",
          approvedOfficeHour
            ? `Location: ${approvedOfficeHour.location} / ${approvedOfficeHour.meeting_mode}`
            : "",
          status === "Approved"
            ? "Please keep this email for your meeting details."
            : "You can return to the scheduler to request another available time."
        ].join("\n")
      }).catch((emailError) => {
        console.error("Could not send status email:", emailError.message);
      });

      response.json({
        message: `Appointment request ${status.toLowerCase()}.`,
        appointment
      });
    } catch (error) {
      console.error(
        "Could not update appointment:",
        error.message
      );

      response.status(500).json({
        message: "Appointment status could not be updated."
      });
    }
  }
);

ensureDatabaseSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
    setInterval(() => {
      sendUpcomingMeetingReminders().catch((error) => {
        console.error("Reminder job failed:", error.message);
      });
    }, 15 * 60 * 1000);
  })
  .catch((error) => {
    console.error("Could not prepare database schema:", error.message);
    if (process.env.NODE_ENV === "production") {
      process.exitCode = 1;
      return;
    }
    console.error(
      "The server will still start in development, but database-backed features require a valid DATABASE_URL."
    );
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });

