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

async function ensureGuestBookingColumns() {
  await pool.query(`
    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS student_name TEXT,
      ADD COLUMN IF NOT EXISTS student_email TEXT
  `);
}

async function sendMeetingEmail({
  to,
  subject,
  text
}) {
  if (!mailer || !to) {
    console.warn(
      "Email not sent. Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM."
    );
    return;
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text
  });
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

app.post(
  "/api/improve-question",
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
      const result = await pool.query(
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
            office_hours.is_available,
            app_users.teacher_slug
          FROM office_hours
          JOIN app_users
            ON office_hours.teacher_id = app_users.id
          WHERE office_hours.is_available = true
          ORDER BY office_hours.id
        `
      );

      response.json(result.rows);
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
    const {
      courseName,
      dayOfWeek,
      startTime,
      endTime,
      location,
      meetingMode
    } = request.body;

    const validDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ];

    const validMeetingModes = [
      "In-person",
      "Zoom",
      "Both"
    ];

    if (
      typeof courseName !== "string" ||
      courseName.trim() === "" ||
      !validDays.includes(dayOfWeek) ||
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      startTime >= endTime ||
      typeof location !== "string" ||
      location.trim() === "" ||
      !validMeetingModes.includes(meetingMode)
    ) {
      return response.status(400).json({
        error: "Please complete all office-hour fields correctly."
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
            is_available
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
          RETURNING
            id,
            course_name,
            instructor_name,
            day_of_week,
            start_time,
            end_time,
            location,
            meeting_mode,
            is_available
        `,
        [
          request.session.user.id,
          courseName.trim(),
          request.session.user.displayName,
          dayOfWeek,
          startTime,
          endTime,
          location.trim(),
          meetingMode
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

ensureGuestBookingColumns()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Could not prepare booking fields:", error.message);
    console.error(
      "The server will still start, but database-backed features require a valid DATABASE_URL."
    );
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
