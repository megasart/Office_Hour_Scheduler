const teacherFinder = document.getElementById("teacher-finder");
const teacherFinderForm = document.getElementById("teacher-finder-form");
const teacherLookupInput = document.getElementById("teacher-lookup");
const teacherFinderMessage = document.getElementById("teacher-finder-message");
const teacherResults = document.getElementById("teacher-results");
const selectedTeacherName = document.getElementById("selected-teacher-name");
const selectedTeacherInfo = document.getElementById("selected-teacher-info");
const selectedTeacherDetails = document.getElementById("selected-teacher-details");
const changeTeacherButton = document.getElementById("change-teacher");
const availabilityCalendar = document.getElementById("availability-calendar");
const officeHourMessage = document.getElementById("office-hour-message");
const bookingStatusMessage = document.getElementById("booking-status-message");
const appointmentDialog = document.getElementById("appointment-dialog");
const appointmentForm = document.getElementById("appointment-form");
const officeHourIdInput = document.getElementById("office-hour-id");
const scheduledDateInput = document.getElementById("scheduled-date");
const studentNameInput = document.getElementById("student-name");
const studentEmailInput = document.getElementById("student-email");
const studentEmailError = document.getElementById("student-email-error");
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
let selectedTeacherSlug = "";
let calendarMonth = new Date();
calendarMonth.setDate(1);

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

function extractTeacherSlug(value) {
  const input = value.trim();
  if (!input) {
    return "";
  }

  let path = input;
  try {
    if (input.includes("://")) {
      path = new URL(input).pathname;
    }
  } catch (error) {
    return "";
  }

  const parts = path.split("/").filter(Boolean);
  const teacherIndex = parts.indexOf("teacher");
  const slug = teacherIndex >= 0
    ? parts[teacherIndex + 1]
    : parts.length === 1
      ? parts[0]
      : "";

  if (!slug || slug.length > 100 || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
    return "";
  }
  return decodeURIComponent(slug).toLowerCase();
}

function renderTeacherDetails(profile) {
  const officeHours = profile.officeHours || [];
  const courses = Array.from(
    new Set(officeHours.map((officeHour) => officeHour.course_name))
  );
  selectedTeacherInfo.textContent = courses.length > 0
    ? "Courses: " + courses.join(", ")
    : "No active office hours are available yet.";

  selectedTeacherDetails.replaceChildren();
  const detailsByCourse = new Map();
  officeHours.forEach((officeHour) => {
    if (!detailsByCourse.has(officeHour.course_name)) {
      detailsByCourse.set(officeHour.course_name, officeHour);
    }
  });

  detailsByCourse.forEach((officeHour) => {
    const card = document.createElement("article");
    card.className = "teacher-info-card";
    const heading = document.createElement("h3");
    heading.textContent = officeHour.course_name;
    const location = document.createElement("p");
    location.textContent =
      officeHour.location + " / " + officeHour.meeting_mode;
    const timeZone = document.createElement("p");
    timeZone.textContent =
      "Time zone: " + (officeHour.time_zone || "America/Los_Angeles");
    card.append(heading, location, timeZone);
    selectedTeacherDetails.appendChild(card);
  });
}

function validateStudentEmail() {
  const value = studentEmailInput.value.trim();
  const valid = /^\S+@\S+\.\S+$/.test(value);
  studentEmailInput.classList.toggle("input-error", !valid);
  studentEmailInput.setAttribute("aria-invalid", String(!valid));
  studentEmailError.textContent = valid
    ? ""
    : "Enter a valid email address, such as you@example.com.";
  return valid;
}

studentEmailInput.addEventListener("input", () => {
  if (studentEmailInput.value.trim() !== "") {
    validateStudentEmail();
  } else {
    studentEmailInput.classList.remove("input-error");
    studentEmailInput.setAttribute("aria-invalid", "false");
    studentEmailError.textContent = "";
  }
});

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

  const toolbar = document.createElement("div");
  toolbar.className = "calendar-toolbar";
  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "calendar-nav-button";
  previousButton.textContent = "‹";
  previousButton.setAttribute("aria-label", "Previous month");
  previousButton.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderAvailabilityCalendar(officeHours);
  });
  const monthLabel = document.createElement("h2");
  monthLabel.className = "calendar-month-label";
  monthLabel.textContent = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "calendar-nav-button";
  nextButton.textContent = "›";
  nextButton.setAttribute("aria-label", "Next month");
  nextButton.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderAvailabilityCalendar(officeHours);
  });
  const todayButton = document.createElement("button");
  todayButton.type = "button";
  todayButton.className = "small-button calendar-today-button";
  todayButton.textContent = "Today";
  todayButton.addEventListener("click", () => {
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    renderAvailabilityCalendar(officeHours);
  });
  toolbar.append(previousButton, monthLabel, nextButton, todayButton);

  const weekdays = document.createElement("div");
  weekdays.className = "calendar-weekdays";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    const label = document.createElement("span");
    label.textContent = day;
    weekdays.appendChild(label);
  });

  const grid = document.createElement("div");
  grid.className = "calendar-month-grid";
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);

  for (let cell = 0; cell < 42; cell += 1) {
    const dateNumber = cell - firstDay + 1;
    const cellElement = document.createElement("section");
    cellElement.className = "calendar-date-cell";

    if (dateNumber < 1 || dateNumber > daysInMonth) {
      cellElement.classList.add("is-muted");
      grid.appendChild(cellElement);
      continue;
    }

    const date = year + "-" +
      String(month + 1).padStart(2, "0") + "-" +
      String(dateNumber).padStart(2, "0");
    if (date === today) {
      cellElement.classList.add("is-today");
    }

    const number = document.createElement("span");
    number.className = "calendar-date-number";
    number.textContent = String(dateNumber);
    cellElement.appendChild(number);

    officeHours
      .filter((officeHour) => officeHour.availability_date === date)
      .forEach((officeHour) => {
        const event = document.createElement("button");
        event.type = "button";
        event.className = "calendar-event";
        event.textContent =
          formatTime(officeHour.start_time) + " " + officeHour.course_name;
        event.setAttribute(
          "aria-label",
          formatDate(date) + ", " +
            formatTime(officeHour.start_time) + " - " +
            formatTime(officeHour.end_time) + ", " +
            officeHour.course_name + " with " +
            officeHour.instructor_name
        );
        event.addEventListener("click", () => {
          openAppointmentDialog(officeHour);
        });
        cellElement.appendChild(event);
      });

    grid.appendChild(cellElement);
  }

  availabilityCalendar.append(toolbar, weekdays, grid);
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

async function loadAvailableOfficeHours(teacherSlug) {
  const response = await fetch(
    "/api/available-office-hours?teacher=" +
      encodeURIComponent(teacherSlug)
  );
  availableOfficeHours = await getResponseData(response);
  renderAvailabilityCalendar(availableOfficeHours);
  officeHourMessage.textContent = availableOfficeHours.length > 0
    ? "Select an available time to request an appointment."
    : "This teacher does not have any open office-hour times yet.";
}

async function findTeacher(value, officeHourId, scheduledDate) {
  const teacherSlug = extractTeacherSlug(value);
  if (!teacherSlug) {
    teacherFinderMessage.textContent =
      "Enter a teacher code or a valid /teacher/ profile link.";
    return;
  }

  const findTeacherButton = teacherFinderForm.querySelector(
    'button[type="submit"]'
  );
  findTeacherButton.disabled = true;
  teacherFinderMessage.textContent = "Finding teacher...";
  try {
    const response = await fetch(
      "/api/teachers/" + encodeURIComponent(teacherSlug)
    );
    const profile = await getResponseData(response);
    selectedTeacherSlug = profile.teacher.teacher_slug;
    teacherLookupInput.value = selectedTeacherSlug;
    selectedTeacherName.textContent = profile.teacher.display_name;
    renderTeacherDetails(profile);

    if (scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      calendarMonth = new Date(scheduledDate + "T12:00:00Z");
      calendarMonth.setDate(1);
    } else {
      calendarMonth = new Date();
      calendarMonth.setDate(1);
    }

    await loadAvailableOfficeHours(selectedTeacherSlug);
    teacherFinder.hidden = true;
    teacherResults.hidden = false;
    teacherFinderMessage.textContent = "";

    const requestedOfficeHourId = Number(officeHourId);
    const requestedOfficeHour = availableOfficeHours.find(
      (officeHour) =>
        officeHour.id === requestedOfficeHourId &&
        (!scheduledDate || officeHour.availability_date === scheduledDate)
    );
    if (requestedOfficeHour) {
      openAppointmentDialog(requestedOfficeHour);
    }
  } catch (error) {
    teacherFinderMessage.textContent = error.message;
  } finally {
    findTeacherButton.disabled = false;
  }
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
  if (!validateStudentEmail()) {
    studentEmailInput.focus();
    return;
  }
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

teacherFinderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  findTeacher(teacherLookupInput.value).catch((error) => {
    teacherFinderMessage.textContent = error.message;
  });
});

changeTeacherButton.addEventListener("click", () => {
  selectedTeacherSlug = "";
  availableOfficeHours = [];
  teacherResults.hidden = true;
  teacherFinder.hidden = false;
  teacherFinderMessage.textContent = "";
  availabilityCalendar.replaceChildren();
  bookingStatusMessage.textContent = "";
  teacherLookupInput.focus();
});

const pageParams = new URLSearchParams(window.location.search);
const initialTeacher = pageParams.get("teacher");
if (initialTeacher) {
  teacherLookupInput.value = initialTeacher;
  findTeacher(
    initialTeacher,
    pageParams.get("officeHour"),
    pageParams.get("date")
  ).catch((error) => {
    teacherFinderMessage.textContent = error.message;
  });
} else {
  availabilityCalendar.replaceChildren();
  officeHourMessage.textContent = "Find a teacher to view availability.";
}
