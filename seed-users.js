require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("./db");

async function createDemoUsers() {
  if (
    !process.env.DEMO_TEACHER_PASSWORD ||
    !process.env.DEMO_STUDENT_PASSWORD
  ) {
    throw new Error("Demo passwords are missing from the .env file.");
  }

  const users = [
    {
      username: "taylor",
      password: process.env.DEMO_TEACHER_PASSWORD,
      role: "teacher",
      displayName: "Dr. Taylor",
      teacherSlug: "taylor"
    },
    {
      username: "student1",
      password: process.env.DEMO_STUDENT_PASSWORD,
      role: "student",
      displayName: "Demo Student",
      teacherSlug: null
    }
  ];

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);

    const result = await pool.query(
      `
        insert into app_users
          (username, password_hash, role, display_name, teacher_slug)
        values
          ($1, $2, $3, $4, $5)
        on conflict (username)
        do update set
          password_hash = excluded.password_hash,
          role = excluded.role,
          display_name = excluded.display_name,
          teacher_slug = excluded.teacher_slug
        returning id, username, role, display_name, teacher_slug;
      `,
      [
        user.username,
        passwordHash,
        user.role,
        user.displayName,
        user.teacherSlug
      ]
    );

    console.log("Created or updated user:", result.rows[0]);
  }
}

createDemoUsers()
  .catch((error) => {
    console.error("Could not create demo users:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });