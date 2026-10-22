const appointmentList = document.getElementById(
  "appointment-list"
);
const teacherMessage = document.getElementById(
  "teacher-message"
);

function formatTime(timeValue) {
  const [hourValue, minuteValue] = timeValue.split(":");
  const hour = Number(hourValue);
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";

  return `${displayHour}:${minuteValue} ${period}`;
}

function createDetail(label, value) {
  const paragraph = document.createElement("p");
  const strongText = document.createElement("strong");

  strongText.textContent = `${label}: `;
  paragraph.append(strongText, document.createTextNode(value));

  return paragraph;
}

function createAppointmentCard(appointment) {
  const card = document.createElement("div");
  card.className = "card appointment-card";

  const title = document.createElement("h3");
  title.textContent =
    `${appointment.course_name} with ` +
    `${appointment.instructor_name}`;

  const officeHour = [
    appointment.day_of_week,
    formatTime(appointment.start_time),
    "-",
    formatTime(appointment.end_time)
  ].join(" ");

  card.append(
    title,
    createDetail("Assignment", appointment.assignment),
    createDetail(
      "Question",
      appointment.problem_description
    ),
    createDetail(
      "Meeting type",
      appointment.meeting_type
    ),
    createDetail("Office hour", officeHour),
    createDetail("Location", appointment.location)
  );

  const actions = document.createElement("div");
  actions.className = "appointment-actions";

  const approveButton = document.createElement("button");
  approveButton.textContent = "Approve";
  approveButton.addEventListener("click", () => {
    updateAppointmentStatus(
      appointment.id,
      "Approved"
    );
  });

  const declineButton = document.createElement("button");
  declineButton.className = "decline-button";
  declineButton.textContent = "Decline";
  declineButton.addEventListener("click", () => {
    updateAppointmentStatus(
      appointment.id,
      "Declined"
    );
  });

  actions.append(approveButton, declineButton);
  card.append(actions);

  return card;
}

async function loadAppointments() {
  appointmentList.textContent =
    "Loading appointment requests...";

  try {
    const response = await fetch(
      "/api/appointments?status=Pending"
    );
    const appointments = await response.json();

    if (!response.ok) {
      throw new Error(appointments.message);
    }

    appointmentList.replaceChildren();

    if (appointments.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent =
        "There are no pending appointment requests.";
      appointmentList.append(emptyMessage);
      return;
    }

    appointments.forEach((appointment) => {
      appointmentList.append(
        createAppointmentCard(appointment)
      );
    });
  } catch (error) {
    console.error("Could not load appointments:", error);
    appointmentList.textContent =
      "Appointment requests could not be loaded.";
  }
}

async function updateAppointmentStatus(id, status) {
  try {
    const response = await fetch(
      `/api/appointments/${id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    teacherMessage.textContent = result.message;
    await loadAppointments();
  } catch (error) {
    console.error("Could not update appointment:", error);
    teacherMessage.textContent =
      "The appointment status could not be updated.";
  }
}

loadAppointments();