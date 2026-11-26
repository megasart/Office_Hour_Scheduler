const officeHourList = document.getElementById("office-hour-list");
const availabilityCalendar = document.getElementById("availability-calendar");
const officeHourMessage = document.getElementById("office-hour-message");
const bookingStatusMessage = document.getElementById("booking-status-message");
const appointmentDialog = document.getElementById("appointment-dialog");
const appointmentForm = document.getElementById("appointment-form");
const officeHourIdInput = document.getElementById("office-hour-id");
const scheduledDateInput = document.getElementById("scheduled-date");
const studentNameInput = document.getElementById("student-name");
const studentEmailInput = document.getElementById("student-email");
const preferredLanguageInput = document.getElementById("preferred-language");
const websiteInput = document.getElementById("website");
const selectedCourseTeacher = document.getElementById("selected-course-teacher");
const selectedTime = document.getElementById("selected-time");
const selectedLocation = document.getElementById("selected-location");
const formMessage = document.getElementById("form-message");
const closeAppointmentDialogButton = document.getElementById("close-appointment-dialog");
const participantList = document.getElementById("participant-list");
const addParticipantButton = document.getElementById("add-participant");
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

let availableOfficeHours = [];

function formatTime(timeValue) {
  if (!timeValue) {
    return "";
  }

  const parts = timeValue.slice(0, 5).split(":").map(Number);
  const suffix = parts[0] >= 12 ? "PM" : "AM";
  const displayHour = parts[0] % 12 || 12;
  return displayHour + ":" + String(parts[1]).padStart(2, "0") + " " + suffix;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Date(dateValue + "T12:00:00Z").toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }
  );
}

async function getResponseData(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request failed.");
  }
  return data;
}

function resetQuestionImprovement() {
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "";
  improvedQuestionText.textContent = "";
  improvementReason.textContent = "";
}

function clearParticipants() {
  participantList.replaceChildren();
}

function addParticipantRow() {
  if (participantList.children.length >= 5) {
    formMessage.textContent = "You may add up to five participants.";
    return;
  }

  const row = document.createElement("div");
  row.className = "participant-row";

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "Participant name";
  name.maxLength = 100;
  name.className = "participant-name";
  name.required = true;

  const email = document.createElement("input");
  email.type = "email";
  email.placeholder = "Participant email";
  email.maxLength = 254;
  email.className = "participant-email";
  email.required = true;

  const role = document.createElement("select");
  role.className = "participant-role";
  role.innerHTML =
    '<option value="Student">Student</option>' +
    '<option value="Assistant staff">Assistant staff</option>';
  role.required = true;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "small-button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());

  row.append(name, email, role, remove);
  participantList.appendChild(row);
}

function readParticipants() {
  return Array.from(participantList.querySelectorAll(".participant-row")).map(
    (row) => ({
      name: row.querySelector(".participant-name").value,
      email: row.querySelector(".participant-email").value,
      role: row.querySelector(".participant-role").value
    })
  );
}

function renderAvailabilityCalendar(officeHours) {
  availabilityCalendar.replaceChildren();
  const title = document.createElement("div");
  title.className = "calendar-title";
  title.textContent = "Upcoming availability";
  availabilityCalendar.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "calendar-grid upcoming-calendar-grid";
  const dates = Array.from(
    new Set(officeHours.map((officeHour) => officeHour.availability_date))
  ).slice(0, 14);

  dates.forEach((date) => {
    const column = document.createElement("section");
    column.className = "calendar-day";
    const heading = document.createElement("h3");
    heading.textContent = formatDate(date);
    column.appendChild(heading);

    officeHours
      .filter((officeHour) => officeHour.availability_date === date)
      .forEach((officeHour) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-office-hour";
        const time = document.createElement("strong");
        time.textContent =
          formatTime(officeHour.start_time) +
          " - " +
          formatTime(officeHour.end_time);
        const course = document.createElement("span");
        course.textContent = officeHour.course_name;
        const teacher = document.createElement("small");
        teacher.textContent = officeHour.instructor_name;
        button.append(time, course, teacher);
        button.addEventListener("click", () => {
          openAppointmentDialog(officeHour);
        });
        column.appendChild(button);
      });
    grid.appendChild(column);
  });

  if (dates.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No upcoming office hours are available.";
    availabilityCalendar.appendChild(empty);
    return;
  }

  availabilityCalendar.appendChild(grid);
}

function createOfficeHourCard(officeHour) {
  const card = document.createElement("article");
  card.className = "student-office-hour-card";
  const title = document.createElement("h3");
  title.textContent =
    officeHour.course_name + " with " + officeHour.instructor_name;
  const date = document.createElement("p");
  date.textContent =
    formatDate(officeHour.availability_date) + ", " +
    formatTime(officeHour.start_time) + " - " +
    formatTime(officeHour.end_time);
  const location = document.createElement("p");
  location.textContent =
    officeHour.location + " / " + officeHour.meeting_mode;
  const capacity = document.createElement("p");
  capacity.textContent =
    "Spots available: " +
    Math.max(0, Number(officeHour.capacity || 1) -
      Number(officeHour.booked_count || 0));

  const actions = document.createElement("div");
  actions.className = "student-office-hour-actions";
  const teacherLink = document.createElement("a");
  teacherLink.href =
    "/teacher/" + encodeURIComponent(officeHour.teacher_slug);
  teacherLink.className = "student-teacher-button";
  teacherLink.textContent = "View Teacher Profile";
  const requestButton = document.createElement("button");
  requestButton.type = "button";
  requestButton.textContent = "Request This Time";
  requestButton.addEventListener("click", () => {
    openAppointmentDialog(officeHour);
  });
  actions.append(teacherLink, requestButton);
  card.append(title, date, location, capacity, actions);
  return card;
}

function openAppointmentDialog(officeHour) {
  appointmentForm.reset();
  resetQuestionImprovement();
  clearParticipants();
  formMessage.textContent = "";
  officeHourIdInput.value = officeHour.id;
  scheduledDateInput.value = officeHour.availability_date;
  selectedCourseTeacher.textContent =
    officeHour.course_name + " with " + officeHour.instructor_name;
  selectedTime.textContent =
    formatDate(officeHour.availability_date) + ", " +
    formatTime(officeHour.start_time) + " - " +
    formatTime(officeHour.end_time);
  selectedLocation.textContent =
    officeHour.location + " / " + officeHour.meeting_mode;
  appointmentDialog.showModal();
}

async function loadAvailableOfficeHours() {
  const response = await fetch("/api/available-office-hours");
  availableOfficeHours = await getResponseData(response);
  renderAvailabilityCalendar(availableOfficeHours);
  officeHourList.replaceChildren();

  if (availableOfficeHours.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "There are no available office hours right now.";
    officeHourList.appendChild(emptyMessage);
    return;
  }

  availableOfficeHours.forEach((officeHour) => {
    officeHourList.appendChild(createOfficeHourCard(officeHour));
  });
}

improveQuestionButton.addEventListener("click", async () => {
  const assignment = assignmentInput.value.trim();
  const problemDescription = problemDescriptionInput.value.trim();
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
    const response = await fetch("/api/improve-question", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assignment,
        problemDescription
      })
    });
    const data = await getResponseData(response);
    improvedQuestionText.textContent = data.improvedQuestion;
    improvementReason.textContent = "Why this is better: " + data.reason;
    questionImprovement.hidden = false;
    aiQuestionMessage.textContent =
      "Would you like to use the improved version?";
  } catch (error) {
    aiQuestionMessage.textContent = error.message;
  } finally {
    improveQuestionButton.disabled = false;
  }
});

useImprovedQuestionButton.addEventListener("click", () => {
  problemDescriptionInput.value = improvedQuestionText.textContent;
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent =
    "The improved question was selected. You may edit it before submitting.";
});

keepOriginalQuestionButton.addEventListener("click", () => {
  questionImprovement.hidden = true;
  aiQuestionMessage.textContent = "Your original question will be used.";
});

problemDescriptionInput.addEventListener("input", resetQuestionImprovement);
addParticipantButton.addEventListener("click", addParticipantRow);

appointmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  formMessage.textContent = "Submitting request...";

  try {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        officeHourId: officeHourIdInput.value,
        scheduledDate: scheduledDateInput.value,
        studentName: studentNameInput.value,
        studentEmail: studentEmailInput.value,
        preferredLanguage: preferredLanguageInput.value,
        assignment: assignmentInput.value,
        problemDescription: problemDescriptionInput.value,
        meetingType: document.getElementById("meeting-type").value,
        participants: readParticipants(),
        website: websiteInput.value
      })
    });
    const data = await getResponseData(response);
    appointmentDialog.close();
    appointmentForm.reset();
    clearParticipants();
    resetQuestionImprovement();
    bookingStatusMessage.textContent =
      data.message + " Check your email for a secure management link.";

    if (data.manageUrl) {
      const link = document.createElement("a");
      link.href = data.manageUrl;
      link.textContent = " Open management link";
      link.target = "_blank";
      bookingStatusMessage.appendChild(link);
    }
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

loadAvailableOfficeHours().catch((error) => {
  officeHourMessage.textContent = error.message;
});
