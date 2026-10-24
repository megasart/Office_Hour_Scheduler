require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from the .env file.");
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
  requireRole("student"),
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
          WHERE is_available = true
          ORDER BY id
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
  requireRole("student"),
  async (request, response) => {
    const {
      officeHourId,
      assignment,
      problemDescription,
      meetingType
    } = request.body;

    const numericOfficeHourId = Number(officeHourId);
    const validMeetingTypes = ["In-person", "Zoom"];

    if (
      !Number.isInteger(numericOfficeHourId) ||
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

      const result = await pool.query(
        `
          INSERT INTO appointments (
            office_hour_id,
            student_id,
            assignment,
            problem_description,
            meeting_type
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, student_id, status, created_at
        `,
        [
          numericOfficeHourId,
          request.session.user.id,
          assignment.trim(),
          problemDescription.trim(),
          meetingType
        ]
      );

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
  requireRole("student"),
  async (request, response) => {
    try {
      const result = await pool.query(
        `
          SELECT
            appointments.id,
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
          WHERE appointments.student_id = $1
          ORDER BY appointments.created_at DESC
        `,
        [request.session.user.id]
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

    const queryValues = [request.session.user.id];

    let query = `
      SELECT
        appointments.id,
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
        office_hours.location
      FROM appointments
      JOIN office_hours
        ON appointments.office_hour_id = office_hours.id
      WHERE office_hours.teacher_id = $1
    `;

    if (requestedStatus) {
      query += " AND appointments.status = $2";
      queryValues.push(requestedStatus);
    }

    query += " ORDER BY appointments.created_at DESC";

    try {
      const result = await pool.query(query, queryValues);

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
          RETURNING appointments.id, appointments.status
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

      response.json({
        message: `Appointment request ${status.toLowerCase()}.`,
        appointment: result.rows[0]
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});