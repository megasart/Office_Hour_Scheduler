const teacherWelcome = document.getElementById("teacher-welcome");
const officeHourList = document.getElementById("office-hour-list");
const appointmentList = document.getElementById("appointment-list");
const teacherMessage = document.getElementById("teacher-message");

const officeHourDialog = document.getElementById(
  "office-hour-dialog"
);

const openOfficeHourDialogButton = document.getElementById(
  "open-office-hour-dialog"
);

const closeOfficeHourDialogButton = document.getElementById(
  "close-office-hour-dialog"
);

const officeHourForm = document.getElementById(
  "office-hour-form"
);

const officeHourFormMessage = document.getElementById(
  "office-hour-form-message"
);

const refreshOfficeHoursButton = document.getElementById(
  "refresh-office-hours"
);

const logoutButton = document.getElementById("logout-button");

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

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

async function getResponseData(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request failed."
    );
  }

  return data;
}

async function requireTeacher() {
  const response = await fetch("/api/me");

  if (!response.ok) {
    window.location.href = "/login.html";
    return null;
  }

  const data = await response.json();

  if (data.user.role !== "teacher") {
    window.location.href = "/login.html";
    return null;
  }

  return data.user;
}

async function loadOfficeHours() {
  const response = await fetch("/api/office-hours");
  const officeHours = await getResponseData(response);

  officeHourList.replaceChildren();

  if (officeHours.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No office hours have been created yet.";
    officeHourList.appendChild(emptyMessage);
    return;
  }

  officeHours.forEach((officeHour) => {
    const card = document.createElement("article");
    card.className = "office-hour-item";

    const title = document.createElement("h3");
    title.textContent =
      `${officeHour.course_name} with ${officeHour.instructor_name}`;

    const details = document.createElement("p");
    details.textContent =
      `${officeHour.day_of_week}, ` +
      `${formatTime(officeHour.start_time)} - ` +
      `${formatTime(officeHour.end_time)}`;

    const location = document.createElement("p");
    location.textContent =
      `${officeHour.location} / ${officeHour.meeting_mode}`;

    const status = document.createElement("p");
    status.className = "office-hour-status";
    status.textContent = officeHour.is_available
      ? "Available"
      : "Unavailable";

    card.append(title, details, location, status);
    officeHourList.appendChild(card);
  });
}

async function loadAppointments() {
  const response = await fetch(
    "/api/appointments?status=Pending"
  );

  const appointments = await getResponseData(response);

  appointmentList.replaceChildren();

  if (appointments.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "There are no pending appointments.";
    appointmentList.appendChild(emptyMessage);
    return;
  }

  appointments.forEach((appointment) => {
    const card = document.createElement("article");
    card.className = "appointment-card";

    const title = document.createElement("h3");
    title.textContent =
      `${appointment.course_name} with ` +
      `${appointment.instructor_name}`;

    const schedule = document.createElement("p");
    schedule.textContent =
      `${appointment.day_of_week}, ` +
      `${formatTime(appointment.start_time)} - ` +
      `${formatTime(appointment.end_time)}`;

    const assignment = document.createElement("p");
    assignment.textContent =
      `Assignment: ${appointment.assignment}`;

    const problem = document.createElement("p");
    problem.textContent =
      `Question: ${appointment.problem_description}`;

    const meetingType = document.createElement("p");
    meetingType.textContent =
      `Meeting type: ${appointment.meeting_type}`;

    const actions = document.createElement("div");
    actions.className = "appointment-actions";

    const approveButton = document.createElement("button");
    approveButton.textContent = "Approve";
    approveButton.type = "button";

    approveButton.addEventListener("click", () => {
      updateAppointmentStatus(appointment.id, "Approved");
    });

    const declineButton = document.createElement("button");
    declineButton.textContent = "Decline";
    declineButton.type = "button";
    declineButton.className = "decline-button";

    declineButton.addEventListener("click", () => {
      updateAppointmentStatus(appointment.id, "Declined");
    });

    actions.append(approveButton, declineButton);
    card.append(
      title,
      schedule,
      assignment,
      problem,
      meetingType,
      actions
    );

    appointmentList.appendChild(card);
  });
}

async function updateAppointmentStatus(appointmentId, status) {
  try {
    const response = await fetch(
      `/api/appointments/${appointmentId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      }
    );

    const data = await getResponseData(response);

    teacherMessage.textContent = data.message;
    await loadAppointments();
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

openOfficeHourDialogButton.addEventListener("click", () => {
  officeHourFormMessage.textContent = "";
  officeHourDialog.showModal();
});

closeOfficeHourDialogButton.addEventListener("click", () => {
  officeHourDialog.close();
});

officeHourForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  officeHourFormMessage.textContent = "Creating office hour...";

  const officeHourData = {
    courseName: document.getElementById("course-name").value,
    dayOfWeek: document.getElementById("day-of-week").value,
    startTime: document.getElementById("start-time").value,
    endTime: document.getElementById("end-time").value,
    location: document.getElementById("location").value,
    meetingMode: document.getElementById("meeting-mode").value
  };

  try {
    const response = await fetch("/api/office-hours", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(officeHourData)
    });

    const data = await getResponseData(response);

    officeHourForm.reset();
    officeHourDialog.close();

    teacherMessage.textContent = data.message;
    await loadOfficeHours();
  } catch (error) {
    officeHourFormMessage.textContent = error.message;
  }
});

refreshOfficeHoursButton.addEventListener("click", () => {
  loadOfficeHours().catch((error) => {
    teacherMessage.textContent = error.message;
  });
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", {
    method: "POST"
  });

  window.location.href = "/login.html";
});

async function initializeDashboard() {
  try {
    const user = await requireTeacher();

    if (!user) {
      return;
    }

    teacherWelcome.textContent =
      `Welcome, ${user.displayName}`;

    await Promise.all([
      loadOfficeHours(),
      loadAppointments()
    ]);
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

initializeDashboard();