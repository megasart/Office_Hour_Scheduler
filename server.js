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

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
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
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid username or password."
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      teacherSlug: user.teacher_slug
    };

    res.json({
      message: "Login successful.",
      user: req.session.user
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      error: "Login failed."
    });
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: "You are not logged in."
    });
  }

  res.json({
    user: req.session.user
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);

      return res.status(500).json({
        error: "Logout failed."
      });
    }

    res.clearCookie("connect.sid");

    res.json({
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

app.post("/api/appointments", async (request, response) => {
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
          assignment,
          problem_description,
          meeting_type
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id, status, created_at
      `,
      [
        numericOfficeHourId,
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
});

app.get("/api/appointments", async (request, response) => {
  const requestedStatus = request.query.status;
  const validStatuses = ["Pending", "Approved", "Declined"];

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
  `;

  if (requestedStatus) {
    query += " WHERE appointments.status = $1";
    queryValues.push(requestedStatus);
  }

  query += " ORDER BY appointments.created_at DESC";

  try {
    const result = await pool.query(query, queryValues);

    response.json(result.rows);
  } catch (error) {
    console.error("Could not load appointments:", error.message);

    response.status(500).json({
      message: "Appointments could not be loaded."
    });
  }
});

app.patch("/api/appointments/:id/status", async (request, response) => {
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
        WHERE id = $2
        RETURNING id, status
      `,
      [status, appointmentId]
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
    console.error("Could not update appointment:", error.message);

    response.status(500).json({
      message: "Appointment status could not be updated."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});