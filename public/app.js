const studentWelcome = document.getElementById(
  "student-welcome"
);

const officeHourList = document.getElementById(
  "office-hour-list"
);

const officeHourMessage = document.getElementById(
  "office-hour-message"
);

const myAppointmentsList = document.getElementById(
  "my-appointments-list"
);

const appointmentStatusMessage = document.getElementById(
  "appointment-status-message"
);

const appointmentDialog = document.getElementById(
  "appointment-dialog"
);

const appointmentForm = document.getElementById(
  "appointment-form"
);

const officeHourIdInput = document.getElementById(
  "office-hour-id"
);

const selectedCourseTeacher = document.getElementById(
  "selected-course-teacher"
);

const selectedTime = document.getElementById(
  "selected-time"
);

const selectedLocation = document.getElementById(
  "selected-location"
);

const formMessage = document.getElementById(
  "form-message"
);

const closeAppointmentDialogButton =
  document.getElementById(
    "close-appointment-dialog"
  );

const refreshAppointmentsButton =
  document.getElementById(
    "refresh-my-appointments"
  );

const logoutButton = document.getElementById(
  "logout-button"
);

const assignmentInput = document.getElementById(
  "assignment"
);

const problemDescriptionInput =
  document.getElementById("problem-description");

const improveQuestionButton =
  document.getElementById(
    "improve-question-button"
  );

const aiQuestionMessage = document.getElementById(
  "ai-question-message"
);

const questionImprovement =
  document.getElementById(
    "question-improvement"
  );

const improvedQuestionText =
  document.getElementById(
    "improved-question-text"
  );

const improvementReason =
  document.getElementById(
    "improvement-reason"
  );

const useImprovedQuestionButton =
  document.getElementById(
    "use-improved-question"
  );

const keepOriginalQuestionButton =
  document.getElementById(
    "keep-original-question"
  );

const submitButton = appointmentForm.querySelector(
  'button[type="submit"]'
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

async function getResponseData(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.message ||
        "The request failed."
    );
  }

  return data;
}

async function requireStudent() {
  const response = await fetch("/api/me");

  if (!response.ok) {
    window.location.href = "/login.html";
    return null;
  }

  const data = await response.json();

  if (data.user.role !== "student") {
    window.location.href = "/login.html";
    return null;
  }

  return data.user;
}

function resetQuestionImprovement() {
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "";
  improvedQuestionText.textContent = "";
  improvementReason.textContent = "";
}

function openAppointmentDialog(officeHour) {
  appointmentForm.reset();
  resetQuestionImprovement();

  officeHourIdInput.value = officeHour.id;

  selectedCourseTeacher.textContent =
    `${officeHour.course_name} with ` +
    `${officeHour.instructor_name}`;

  selectedTime.textContent =
    `${officeHour.day_of_week}, ` +
    `${formatTime(officeHour.start_time)} - ` +
    `${formatTime(officeHour.end_time)}`;

  selectedLocation.textContent =
    `${officeHour.location} / ` +
    `${officeHour.meeting_mode}`;

  formMessage.textContent = "";

  appointmentDialog.showModal();
}

async function loadAvailableOfficeHours() {
  const response = await fetch(
    "/api/available-office-hours"
  );

  const officeHours = await getResponseData(response);

  officeHourList.replaceChildren();

  if (officeHours.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.textContent =
      "There are no available office hours right now.";

    officeHourList.appendChild(emptyMessage);
    return;
  }

  officeHours.forEach((officeHour) => {
    const card = document.createElement("article");
    card.className = "student-office-hour-card";

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

    const actions = document.createElement("div");
    actions.className =
      "student-office-hour-actions";

    const teacherLink = document.createElement("a");

    teacherLink.href =
      `/teacher/${encodeURIComponent(
        officeHour.teacher_slug
      )}`;

    teacherLink.className =
      "student-teacher-button";

    teacherLink.textContent =
      "View Teacher Profile";

    const requestButton = document.createElement(
      "button"
    );

    requestButton.type = "button";
    requestButton.textContent =
      "Request This Time";

    requestButton.addEventListener("click", () => {
      openAppointmentDialog(officeHour);
    });

    actions.append(
      teacherLink,
      requestButton
    );

    card.append(
      title,
      time,
      location,
      actions
    );

    officeHourList.appendChild(card);
  });
}

async function loadMyAppointments() {
  const response = await fetch(
    "/api/my-appointments"
  );

  const appointments = await getResponseData(response);

  myAppointmentsList.replaceChildren();

  if (appointments.length === 0) {
    const emptyMessage = document.createElement("p");

    emptyMessage.textContent =
      "You have not submitted any appointments yet.";

    myAppointmentsList.appendChild(emptyMessage);
    return;
  }

  appointments.forEach((appointment) => {
    const card = document.createElement("article");
    card.className =
      "student-appointment-card";

    const title = document.createElement("h3");

    title.textContent =
      `${appointment.course_name} with ` +
      `${appointment.instructor_name}`;

    const schedule = document.createElement("p");

    schedule.textContent =
      `${appointment.day_of_week}, ` +
      `${formatTime(appointment.start_time)} - ` +
      `${formatTime(appointment.end_time)}`;

    const location = document.createElement("p");

    location.textContent =
      `${appointment.location} / ` +
      `${appointment.meeting_mode}`;

    const assignment = document.createElement("p");

    assignment.textContent =
      `Assignment: ${appointment.assignment}`;

    const problem = document.createElement("p");

    problem.textContent =
      `Question: ${appointment.problem_description}`;

    const meetingType = document.createElement("p");

    meetingType.textContent =
      `Meeting type: ${appointment.meeting_type}`;

    const status = document.createElement("p");

    status.className = "appointment-status";

    status.textContent =
      `Status: ${appointment.status}`;

    if (appointment.status === "Approved") {
      status.classList.add("approved");
    } else if (appointment.status === "Declined") {
      status.classList.add("declined");
    } else {
      status.classList.add("pending");
    }

    card.append(
      title,
      schedule,
      location,
      assignment,
      problem,
      meetingType,
      status
    );

    myAppointmentsList.appendChild(card);
  });
}

improveQuestionButton.addEventListener(
  "click",
  async () => {
    const assignment =
      assignmentInput.value.trim();

    const problemDescription =
      problemDescriptionInput.value.trim();

    if (!assignment || !problemDescription) {
      aiQuestionMessage.textContent =
        "Enter the assignment and your question first.";

      return;
    }

    improveQuestionButton.disabled = true;
    questionImprovement.hidden = true;

    aiQuestionMessage.textContent =
      "Creating a clearer version of your question...";

    try {
      const response = await fetch(
        "/api/improve-question",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            assignment,
            problemDescription
          })
        }
      );

      const data = await getResponseData(response);

      improvedQuestionText.textContent =
        data.improvedQuestion;

      improvementReason.textContent =
        `Why this is better: ${data.reason}`;

      questionImprovement.hidden = false;

      aiQuestionMessage.textContent =
        "Would you like to use the improved version?";
    } catch (error) {
      aiQuestionMessage.textContent =
        error.message;
    } finally {
      improveQuestionButton.disabled = false;
    }
  }
);

useImprovedQuestionButton.addEventListener(
  "click",
  () => {
    problemDescriptionInput.value =
      improvedQuestionText.textContent;

    questionImprovement.hidden = true;

    aiQuestionMessage.textContent =
      "The improved question was selected. You may edit it before submitting.";
  }
);

keepOriginalQuestionButton.addEventListener(
  "click",
  () => {
    questionImprovement.hidden = true;

    aiQuestionMessage.textContent =
      "Your original question will be used.";
  }
);

problemDescriptionInput.addEventListener(
  "input",
  () => {
    questionImprovement.hidden = true;
    aiQuestionMessage.textContent = "";
  }
);

appointmentForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    submitButton.disabled = true;

    formMessage.textContent =
      "Submitting request...";

    const appointmentData = {
      officeHourId: officeHourIdInput.value,
      assignment: assignmentInput.value,
      problemDescription:
        problemDescriptionInput.value,
      meetingType: document.getElementById(
        "meeting-type"
      ).value
    };

    try {
      const response = await fetch(
        "/api/appointments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(appointmentData)
        }
      );

      const data = await getResponseData(response);

      appointmentDialog.close();
      appointmentForm.reset();
      resetQuestionImprovement();

      appointmentStatusMessage.textContent =
        data.message;

      await loadMyAppointments();
    } catch (error) {
      formMessage.textContent =
        error.message;
    } finally {
      submitButton.disabled = false;
    }
  }
);

closeAppointmentDialogButton.addEventListener(
  "click",
  () => {
    resetQuestionImprovement();
    appointmentDialog.close();
  }
);

refreshAppointmentsButton.addEventListener(
  "click",
  async () => {
    try {
      appointmentStatusMessage.textContent =
        "Refreshing...";

      await loadMyAppointments();

      appointmentStatusMessage.textContent =
        "Appointments refreshed.";
    } catch (error) {
      appointmentStatusMessage.textContent =
        error.message;
    }
  }
);

logoutButton.addEventListener(
  "click",
  async () => {
    await fetch("/api/logout", {
      method: "POST"
    });

    window.location.href = "/login.html";
  }
);

async function initializeStudentPage() {
  try {
    const user = await requireStudent();

    if (!user) {
      return;
    }

    studentWelcome.textContent =
      `Welcome, ${user.displayName}`;

    await Promise.all([
      loadAvailableOfficeHours(),
      loadMyAppointments()
    ]);
  } catch (error) {
    officeHourMessage.textContent =
      error.message;
  }
}

initializeStudentPage();