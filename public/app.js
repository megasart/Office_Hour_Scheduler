const officeHourList = document.getElementById("office-hour-list");
const availabilityCalendar = document.getElementById("availability-calendar");
const officeHourMessage = document.getElementById("office-hour-message");
const myAppointmentsList = document.getElementById("my-appointments-list");
const appointmentStatusMessage = document.getElementById("appointment-status-message");
const appointmentDialog = document.getElementById("appointment-dialog");
const appointmentForm = document.getElementById("appointment-form");
const officeHourIdInput = document.getElementById("office-hour-id");
const studentNameInput = document.getElementById("student-name");
const studentEmailInput = document.getElementById("student-email");
const lookupEmailInput = document.getElementById("lookup-email");
const selectedCourseTeacher = document.getElementById("selected-course-teacher");
const selectedTime = document.getElementById("selected-time");
const selectedLocation = document.getElementById("selected-location");
const formMessage = document.getElementById("form-message");
const closeAppointmentDialogButton = document.getElementById("close-appointment-dialog");
const refreshAppointmentsButton = document.getElementById("refresh-my-appointments");
const assignmentInput = document.getElementById("assignment");
const problemDescriptionInput = document.getElementById("problem-description");
const improveQuestionButton = document.getElementById("improve-question-button");
const aiQuestionMessage = document.getElementById("ai-question-message");
const questionImprovement = document.getElementById("question-improvement");
const improvedQuestionText = document.getElementById("improved-question-text");
const improvementReason = document.getElementById("improvement-reason");
const useImprovedQuestionButton = document.getElementById("use-improved-question");
const keepOriginalQuestionButton = document.getElementById("keep-original-question");
const submitButton = appointmentForm.querySelector('button[type="submit"]');

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function formatTime(timeValue) {
  if (!timeValue) return "";
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

async function getResponseData(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || "The request failed.");
  return data;
}

function resetQuestionImprovement() {
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "";
  improvedQuestionText.textContent = "";
  improvementReason.textContent = "";
}

function renderAvailabilityCalendar(officeHours) {
  availabilityCalendar.replaceChildren();
  const title = document.createElement("div");
  title.className = "calendar-title";
  title.textContent = "Weekly availability";
  availabilityCalendar.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  DAYS.forEach((day) => {
    const column = document.createElement("section");
    column.className = "calendar-day";
    const heading = document.createElement("h3");
    heading.textContent = day;
    column.appendChild(heading);

    const dayHours = officeHours
      .filter((officeHour) => officeHour.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (dayHours.length === 0) {
      const empty = document.createElement("p");
      empty.className = "calendar-empty";
      empty.textContent = "No hours";
      column.appendChild(empty);
    } else {
      dayHours.forEach((officeHour) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-office-hour";
        const time = document.createElement("strong");
        time.textContent = `${formatTime(officeHour.start_time)} - ${formatTime(officeHour.end_time)}`;
        const course = document.createElement("span");
        course.textContent = officeHour.course_name;
        const teacher = document.createElement("small");
        teacher.textContent = officeHour.instructor_name;
        button.append(time, course, teacher);
        button.addEventListener("click", () => openAppointmentDialog(officeHour));
        column.appendChild(button);
      });
    }
    grid.appendChild(column);
  });
  availabilityCalendar.appendChild(grid);
}

function createOfficeHourCard(officeHour) {
  const card = document.createElement("article");
  card.className = "student-office-hour-card";
  const title = document.createElement("h3");
  title.textContent = `${officeHour.course_name} with ${officeHour.instructor_name}`;
  const time = document.createElement("p");
  time.textContent = `${officeHour.day_of_week}, ${formatTime(officeHour.start_time)} - ${formatTime(officeHour.end_time)}`;
  const location = document.createElement("p");
  location.textContent = `${officeHour.location} / ${officeHour.meeting_mode}`;
  const actions = document.createElement("div");
  actions.className = "student-office-hour-actions";

  const teacherLink = document.createElement("a");
  teacherLink.href = `/teacher/${encodeURIComponent(officeHour.teacher_slug)}`;
  teacherLink.className = "student-teacher-button";
  teacherLink.textContent = "View Teacher Profile";
  const requestButton = document.createElement("button");
  requestButton.type = "button";
  requestButton.textContent = "Request This Time";
  requestButton.addEventListener("click", () => openAppointmentDialog(officeHour));
  actions.append(teacherLink, requestButton);
  card.append(title, time, location, actions);
  return card;
}

function openAppointmentDialog(officeHour) {
  appointmentForm.reset();
  resetQuestionImprovement();
  officeHourIdInput.value = officeHour.id;
  selectedCourseTeacher.textContent = `${officeHour.course_name} with ${officeHour.instructor_name}`;
  selectedTime.textContent = `${officeHour.day_of_week}, ${formatTime(officeHour.start_time)} - ${formatTime(officeHour.end_time)}`;
  selectedLocation.textContent = `${officeHour.location} / ${officeHour.meeting_mode}`;
  formMessage.textContent = "";
  appointmentDialog.showModal();
}

async function loadAvailableOfficeHours() {
  const response = await fetch("/api/available-office-hours");
  const officeHours = await getResponseData(response);
  renderAvailabilityCalendar(officeHours);
  officeHourList.replaceChildren();
  if (officeHours.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "There are no available office hours right now.";
    officeHourList.appendChild(emptyMessage);
    return;
  }
  officeHours.forEach((officeHour) => officeHourList.appendChild(createOfficeHourCard(officeHour)));
}

async function loadMyAppointments() {
  const email = lookupEmailInput.value.trim();
  if (!email) {
    myAppointmentsList.innerHTML = "<p>Enter the email you used to request a meeting.</p>";
    return;
  }
  const response = await fetch(`/api/my-appointments?email=${encodeURIComponent(email)}`);
  const appointments = await getResponseData(response);
  myAppointmentsList.replaceChildren();
  if (appointments.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No appointments were found for that email.";
    myAppointmentsList.appendChild(emptyMessage);
    return;
  }
  appointments.forEach((appointment) => {
    const card = document.createElement("article");
    card.className = "student-appointment-card";
    const title = document.createElement("h3");
    title.textContent = `${appointment.course_name} with ${appointment.instructor_name}`;
    const schedule = document.createElement("p");
    schedule.textContent = `${appointment.day_of_week}, ${formatTime(appointment.start_time)} - ${formatTime(appointment.end_time)}`;
    const location = document.createElement("p");
    location.textContent = `${appointment.location} / ${appointment.meeting_mode}`;
    const assignment = document.createElement("p");
    assignment.textContent = `Assignment: ${appointment.assignment}`;
    const status = document.createElement("p");
    status.className = `appointment-status ${appointment.status.toLowerCase()}`;
    status.textContent = `Status: ${appointment.status}`;
    card.append(title, schedule, location, assignment, status);
    myAppointmentsList.appendChild(card);
  });
}

improveQuestionButton.addEventListener("click", async () => {
  const assignment = assignmentInput.value.trim();
  const problemDescription = problemDescriptionInput.value.trim();
  if (!assignment || !problemDescription) {
    aiQuestionMessage.textContent = "Enter the assignment and your question first.";
    return;
  }
  improveQuestionButton.disabled = true;
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "Creating a clearer version of your question...";
  try {
    const response = await fetch("/api/improve-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignment, problemDescription })
    });
    const data = await getResponseData(response);
    improvedQuestionText.textContent = data.improvedQuestion;
    improvementReason.textContent = `Why this is better: ${data.reason}`;
    questionImprovement.hidden = false;
    aiQuestionMessage.textContent = "Would you like to use the improved version?";
  } catch (error) {
    aiQuestionMessage.textContent = error.message;
  } finally {
    improveQuestionButton.disabled = false;
  }
});

useImprovedQuestionButton.addEventListener("click", () => {
  problemDescriptionInput.value = improvedQuestionText.textContent;
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "The improved question was selected. You may edit it before submitting.";
});

keepOriginalQuestionButton.addEventListener("click", () => {
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "Your original question will be used.";
});

problemDescriptionInput.addEventListener("input", resetQuestionImprovement);

appointmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  formMessage.textContent = "Submitting request...";
  const appointmentData = {
    officeHourId: officeHourIdInput.value,
    studentName: studentNameInput.value,
    studentEmail: studentEmailInput.value,
    assignment: assignmentInput.value,
    problemDescription: problemDescriptionInput.value,
    meetingType: document.getElementById("meeting-type").value
  };
  try {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appointmentData)
    });
    const data = await getResponseData(response);
    lookupEmailInput.value = studentEmailInput.value.trim();
    appointmentDialog.close();
    appointmentForm.reset();
    resetQuestionImprovement();
    appointmentStatusMessage.textContent = `${data.message} Check your email for updates.`;
    await loadMyAppointments();
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

closeAppointmentDialogButton.addEventListener("click", () => {
  resetQuestionImprovement();
  appointmentDialog.close();
});

refreshAppointmentsButton.addEventListener("click", () => {
  appointmentStatusMessage.textContent = "Looking up appointments...";
  loadMyAppointments()
    .then(() => { appointmentStatusMessage.textContent = "Appointments updated."; })
    .catch((error) => { appointmentStatusMessage.textContent = error.message; });
});

loadAvailableOfficeHours().catch((error) => {
  officeHourMessage.textContent = error.message;
});
