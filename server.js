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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});