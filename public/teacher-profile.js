const teacherName = document.getElementById(
  "teacher-name"
);

const profileMessage = document.getElementById(
  "profile-message"
);

const profileOfficeHours = document.getElementById(
  "profile-office-hours"
);

function formatTime(timeValue) {
  if (!timeValue) {
    return "";
  }

  const [hours, minutes] = timeValue
    .slice(0, 5)
    .split(":")
    .map(Number);

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(
    2,
    "0"
  )} ${suffix}`;
}

async function loadTeacherProfile() {
  const pathParts = window.location.pathname
    .split("/")
    .filter(Boolean);

  const teacherSlug = pathParts[pathParts.length - 1];

  const response = await fetch(
    `/api/teachers/${encodeURIComponent(teacherSlug)}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Teacher profile could not be loaded."
    );
  }

  teacherName.textContent = data.teacher.display_name;

  profileOfficeHours.replaceChildren();

  if (data.officeHours.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent =
      "This teacher does not have any available office hours.";

    profileOfficeHours.appendChild(emptyMessage);
    return;
  }

  data.officeHours.forEach((officeHour) => {
    const card = document.createElement("article");
    card.className = "profile-office-hour-card";

    const title = document.createElement("h3");
    title.textContent =
      `${officeHour.course_name} with ` +
      `${officeHour.instructor_name}`;

    const time = document.createElement("p");
    time.textContent =
      `${officeHour.day_of_week}, ` +
      `${formatTime(officeHour.start_time)} - ` +
      `${formatTime(officeHour.end_time)}`;

    const location = document.createElement("p");
    location.textContent =
      `${officeHour.location} / ` +
      `${officeHour.meeting_mode}`;

    const loginLink = document.createElement("a");
    loginLink.href = "/login.html";
    loginLink.className = "profile-request-link";
    loginLink.textContent = "Log In to Request";

    card.append(
      title,
      time,
      location,
      loginLink
    );

    profileOfficeHours.appendChild(card);
  });
}

loadTeacherProfile().catch((error) => {
  teacherName.textContent = "Teacher Profile";
  profileMessage.textContent = error.message;
});