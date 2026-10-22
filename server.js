const express = require("express");
const path = require("path");
const database = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (request, response) => {
  try {
    const result = await database.query(
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
    const officeHour = await database.query(
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

    const result = await database.query(
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});