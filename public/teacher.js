const teacherWelcome = document.getElementById("teacher-welcome");
const teacherProfileLink = document.getElementById("teacher-profile-link");
const officeHourList = document.getElementById("office-hour-list");
const appointmentList = document.getElementById("appointment-list");
const upcomingMeetings = document.getElementById("upcoming-meetings");
const teacherMessage = document.getElementById("teacher-message");
const appointmentFilter = document.getElementById("appointment-filter");
const officeHourDialog = document.getElementById("office-hour-dialog");
const officeHourDialogTitle = document.getElementById("office-hour-dialog-title");
const openOfficeHourDialogButton = document.getElementById("open-office-hour-dialog");
const closeOfficeHourDialogButton = document.getElementById("close-office-hour-dialog");
const officeHourForm = document.getElementById("office-hour-form");
const officeHourFormMessage = document.getElementById("office-hour-form-message");
const refreshOfficeHoursButton = document.getElementById("refresh-office-hours");
const logoutButton = document.getElementById("logout-button");
const scheduleTypeInput = document.getElementById("schedule-type");
const dayInput = document.getElementById("day-of-week");
const dayLabel = document.getElementById("day-label");
const dateInput = document.getElementById("specific-date");
const dateLabel = document.getElementById("date-label");
const declineDialog = document.getElementById("decline-dialog");
const declineForm = document.getElementById("decline-form");
const declineSummary = document.getElementById("decline-summary");
const declineReasonInput = document.getElementById("decline-reason");
const declineFormMessage = document.getElementById("decline-form-message");
const closeDeclineDialogButton = document.getElementById("close-decline-dialog");
const cancelDeclineButton = document.getElementById("cancel-decline");
const submitDeclineButton = document.getElementById("submit-decline");
const cancelMeetingDialog = document.getElementById("cancel-meeting-dialog");
const cancelMeetingForm = document.getElementById("cancel-meeting-form");
const cancelMeetingSummary = document.getElementById("cancel-meeting-summary");
const cancelMeetingReasonInput = document.getElementById("cancel-meeting-reason");
const cancelMeetingFormMessage = document.getElementById("cancel-meeting-form-message");
const closeCancelMeetingDialogButton = document.getElementById(
  "close-cancel-meeting-dialog"
);
const keepMeetingButton = document.getElementById("keep-meeting");
const submitCancelMeetingButton = document.getElementById(
  "submit-cancel-meeting"
);

let pendingDeclineAppointment = null;
let pendingCancelAppointment = null;

function formatTime(timeValue) {
  if (!timeValue) {
    return "";
  }
  const parts = timeValue.slice(0, 5).split(":").map(Number);
  const suffix = parts[0] >= 12 ? "PM" : "AM";
  const hour = parts[0] % 12 || 12;
  return hour + ":" + String(parts[1]).padStart(2, "0") + " " + suffix;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Weekly";
  }
  return new Date(String(dateValue).slice(0, 10) + "T12:00:00Z")
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
}

async function getResponseData(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request failed.");
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

function updateScheduleFields() {
  const oneTime = scheduleTypeInput.value === "one-time";
  dayInput.hidden = oneTime;
  dayInput.required = !oneTime;
  dayLabel.hidden = oneTime;
  dateInput.hidden = !oneTime;
  dateInput.required = oneTime;
  dateLabel.hidden = !oneTime;
}

function resetOfficeHourForm() {
  officeHourForm.reset();
  document.getElementById("office-hour-id").value = "";
  document.getElementById("capacity").value = "1";
  document.getElementById("time-zone").value = "America/Los_Angeles";
  scheduleTypeInput.value = "recurring";
  updateScheduleFields();
  officeHourDialogTitle.textContent = "Create Office Hour";
  officeHourFormMessage.textContent = "";
}

function fillOfficeHourForm(officeHour) {
  document.getElementById("office-hour-id").value = officeHour.id;
  document.getElementById("course-name").value = officeHour.course_name;
  document.getElementById("schedule-type").value =
    officeHour.specific_date ? "one-time" : "recurring";
  document.getElementById("day-of-week").value = officeHour.day_of_week;
  document.getElementById("specific-date").value =
    officeHour.specific_date
      ? String(officeHour.specific_date).slice(0, 10)
      : "";
  document.getElementById("start-time").value =
    String(officeHour.start_time).slice(0, 5);
  document.getElementById("end-time").value =
    String(officeHour.end_time).slice(0, 5);
  document.getElementById("location").value = officeHour.location;
  document.getElementById("meeting-link").value =
    officeHour.meeting_link || "";
  document.getElementById("meeting-mode").value = officeHour.meeting_mode;
  document.getElementById("capacity").value = officeHour.capacity || 1;
  document.getElementById("time-zone").value =
    officeHour.time_zone || "America/Los_Angeles";
  updateScheduleFields();
  officeHourDialogTitle.textContent = "Edit Office Hour";
  officeHourFormMessage.textContent = "";
}

function createOfficeHourCard(officeHour) {
  const card = document.createElement("article");
  card.className = "office-hour-item";
  const title = document.createElement("h3");
  title.textContent =
    officeHour.course_name + " with " + officeHour.instructor_name;
  const date = document.createElement("p");
  date.textContent =
    formatDate(officeHour.specific_date) + ", " +
    formatTime(officeHour.start_time) + " - " +
    formatTime(officeHour.end_time);
  const location = document.createElement("p");
  location.textContent =
    officeHour.location + " / " + officeHour.meeting_mode;
  const capacity = document.createElement("p");
  capacity.textContent =
    "Capacity: " + (officeHour.capacity || 1) +
    (officeHour.meeting_link ? " | Meeting link configured" : "");
  const status = document.createElement("p");
  status.className = "office-hour-status";
  status.textContent = officeHour.is_available ? "Available" : "Paused";

  const actions = document.createElement("div");
  actions.className = "appointment-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    fillOfficeHourForm(officeHour);
    officeHourDialog.showModal();
  });
  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "decline-button";
  pauseButton.textContent = "Pause";
  pauseButton.disabled = !officeHour.is_available;
  pauseButton.addEventListener("click", async () => {
    if (!window.confirm("Pause this office hour?")) {
      return;
    }
    try {
      const response = await fetch("/api/office-hours/" + officeHour.id, {
        method: "DELETE"
      });
      const data = await getResponseData(response);
      teacherMessage.textContent = data.message;
      await loadOfficeHours();
    } catch (error) {
      teacherMessage.textContent = error.message;
    }
  });
  actions.append(editButton, pauseButton);
  card.append(title, date, location, capacity, status, actions);
  return card;
}

async function loadOfficeHours() {
  const response = await fetch("/api/office-hours");
  const officeHours = await getResponseData(response);
  officeHourList.replaceChildren();
  if (officeHours.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No office hours have been created yet.";
    officeHourList.appendChild(empty);
    return;
  }
  officeHours.forEach((officeHour) => {
    officeHourList.appendChild(createOfficeHourCard(officeHour));
  });
}

function createAiAnalysisSection(appointment) {
  const section = document.createElement("section");
  section.className = "ai-analysis";
  const heading = document.createElement("h4");
  heading.textContent = "AI Meeting Preparation";
  const summary = document.createElement("p");
  summary.textContent = appointment.ai_summary
    ? "Summary: " + appointment.ai_summary
    : "Summary: Not available.";
  const topic = document.createElement("p");
  topic.textContent = appointment.ai_topic
    ? "Topic: " + appointment.ai_topic
    : "Topic: Not available.";
  const questions = document.createElement("p");
  questions.textContent = appointment.ai_suggested_questions
    ? "Suggested questions: " + appointment.ai_suggested_questions
    : "Suggested questions: Not available.";
  section.append(heading, summary, topic, questions);
  return section;
}

function createAppointmentCard(appointment) {
  const card = document.createElement("article");
  card.className = "appointment-card";
  const title = document.createElement("h3");
  title.textContent =
    appointment.course_name + " with " + appointment.instructor_name;
  const student = document.createElement("p");
  student.textContent =
    "Student: " + (appointment.student_name || "Guest") +
    " (" + (appointment.student_email || "no email") + ")";
  const schedule = document.createElement("p");
  schedule.textContent =
    (appointment.request_kind === "Reschedule"
      ? "Requested new time: "
      : "Meeting: ") +
    formatDate(
      appointment.request_kind === "Reschedule"
        ? appointment.requested_scheduled_date
        : appointment.scheduled_date
    ) + ", " +
    formatTime(
      appointment.request_kind === "Reschedule"
        ? appointment.requested_start_time
        : appointment.start_time
    ) + " - " +
    formatTime(
      appointment.request_kind === "Reschedule"
        ? appointment.requested_end_time
        : appointment.end_time
    );
  const assignment = document.createElement("p");
  assignment.textContent = "Assignment: " + appointment.assignment;
  const problem = document.createElement("p");
  problem.textContent = "Question: " + appointment.problem_description;
  const language = document.createElement("p");
  language.textContent = appointment.preferred_language
    ? "Meeting language support: " + appointment.preferred_language
    : "No meeting language support requested.";
  const status = document.createElement("p");
  status.className = "appointment-status " + appointment.status.toLowerCase();
  status.textContent =
    (appointment.request_kind === "Reschedule"
      ? "Reschedule request | "
      : "") + appointment.status;
  const actions = document.createElement("div");
  actions.className = "appointment-actions";

  if (appointment.status === "Pending") {
    const approve = document.createElement("button");
    approve.type = "button";
    approve.textContent =
      appointment.request_kind === "Reschedule"
        ? "Approve Reschedule"
        : "Approve";
    approve.addEventListener("click", () => {
      updateAppointmentStatus(appointment.id, "Approved");
    });
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "decline-button";
    decline.textContent =
      appointment.request_kind === "Reschedule"
        ? "Decline Reschedule"
        : "Decline";
    decline.addEventListener("click", () => {
      openDeclineDialog(appointment);
    });
    actions.append(approve, decline);
  }

  if (appointment.status === "Declined") {
    const reopen = document.createElement("button");
    reopen.type = "button";
    reopen.textContent = "Reopen Request";
    reopen.addEventListener("click", () => {
      reopenAppointment(appointment.id);
    });
    actions.appendChild(reopen);
  }

  if (appointment.status === "Approved") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "decline-button";
    cancel.textContent = "Cancel Meeting";
    cancel.addEventListener("click", () => {
      openCancelMeetingDialog(appointment);
    });
    actions.appendChild(cancel);
  }

  card.append(
    title,
    student,
    schedule,
    assignment,
    problem,
    language,
    status,
    createAiAnalysisSection(appointment),
    actions
  );
  return card;
}

async function loadAppointments() {
  const response = await fetch(
    "/api/appointments?status=" +
      encodeURIComponent(appointmentFilter.value)
  );
  const appointments = await getResponseData(response);
  appointmentList.replaceChildren();
  if (appointments.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "There are no matching appointments.";
    appointmentList.appendChild(empty);
    return;
  }
  appointments.forEach((appointment) => {
    appointmentList.appendChild(createAppointmentCard(appointment));
  });
}

function createUpcomingMeetingCard(appointment) {
  const card = document.createElement("article");
  card.className = "upcoming-meeting-card";

  const date = document.createElement("p");
  date.className = "upcoming-meeting-date";
  const meetingDate = appointment.scheduled_date
    ? String(appointment.scheduled_date).slice(0, 10)
    : "";
  const today = new Date().toISOString().slice(0, 10);
  if (!meetingDate) {
    date.textContent = "Date not assigned";
    card.classList.add("is-undated");
  } else if (meetingDate < today) {
    date.textContent = "Past meeting · " + formatDate(meetingDate);
    card.classList.add("is-past");
  } else {
    date.textContent = formatDate(meetingDate);
  }

  const time = document.createElement("p");
  time.className = "upcoming-meeting-time";
  time.textContent =
    formatTime(appointment.start_time) + " - " +
    formatTime(appointment.end_time);

  const course = document.createElement("h3");
  course.textContent = appointment.course_name;

  const student = document.createElement("p");
  student.textContent =
    (appointment.student_name || "Guest") +
    " · " +
    (appointment.student_email || "No email");

  const location = document.createElement("p");
  location.className = "upcoming-meeting-location";
  location.textContent =
    appointment.location + " / " + appointment.meeting_mode;

  const status = document.createElement("span");
  status.className = "appointment-status approved";
  status.textContent = "Approved";

  const actions = document.createElement("div");
  actions.className = "appointment-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "decline-button small-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    openCancelMeetingDialog(appointment);
  });
  actions.appendChild(cancel);

  card.append(date, time, course, student, location, status, actions);
  return card;
}

async function loadUpcomingMeetings() {
  const response = await fetch("/api/appointments?status=Approved");
  const appointments = await getResponseData(response);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments
    .filter((appointment) =>
      appointment.scheduled_date &&
      String(appointment.scheduled_date).slice(0, 10) >= today
    )
    .sort((first, second) => {
      const firstStart = String(first.scheduled_date).slice(0, 10) +
        "T" + first.start_time;
      const secondStart = String(second.scheduled_date).slice(0, 10) +
        "T" + second.start_time;
      return firstStart.localeCompare(secondStart);
    });
  const olderOrUndated = appointments
    .filter((appointment) =>
      !appointment.scheduled_date ||
      String(appointment.scheduled_date).slice(0, 10) < today
    )
    .sort((first, second) => {
      const firstDate = first.scheduled_date
        ? String(first.scheduled_date).slice(0, 10)
        : "";
      const secondDate = second.scheduled_date
        ? String(second.scheduled_date).slice(0, 10)
        : "";
      return secondDate.localeCompare(firstDate);
    });
  const allApproved = upcoming.concat(olderOrUndated);

  upcomingMeetings.replaceChildren();
  if (allApproved.length === 0) {
    const empty = document.createElement("p");
    empty.className = "upcoming-meetings-empty";
    empty.textContent = "No approved meetings are scheduled yet.";
    upcomingMeetings.appendChild(empty);
    return;
  }

  upcoming.slice(0, 10).forEach((appointment) => {
    upcomingMeetings.appendChild(createUpcomingMeetingCard(appointment));
  });

  if (olderOrUndated.length > 0) {
    const historyHeading = document.createElement("h3");
    historyHeading.className = "upcoming-secondary-heading";
    historyHeading.textContent = upcoming.length > 0
      ? "Earlier approved meetings"
      : "Approved meetings";
    upcomingMeetings.appendChild(historyHeading);
    olderOrUndated.slice(0, 10).forEach((appointment) => {
      upcomingMeetings.appendChild(createUpcomingMeetingCard(appointment));
    });
  }
}

function openDeclineDialog(appointment) {
  pendingDeclineAppointment = appointment;
  declineSummary.textContent =
    "Decline the request from " +
    (appointment.student_name || "this student") +
    " for " +
    formatDate(
      appointment.request_kind === "Reschedule"
        ? appointment.requested_scheduled_date
        : appointment.scheduled_date
    ) +
    "?";
  declineReasonInput.value = "";
  declineFormMessage.textContent = "";
  declineDialog.showModal();
  declineReasonInput.focus();
}

function closeDeclineDialog() {
  pendingDeclineAppointment = null;
  declineFormMessage.textContent = "";
  declineDialog.close();
}

function openCancelMeetingDialog(appointment) {
  pendingCancelAppointment = appointment;
  cancelMeetingSummary.textContent =
    "Cancel the approved meeting with " +
    (appointment.student_name || "this student") +
    " on " +
    formatDate(appointment.scheduled_date) +
    "?";
  cancelMeetingReasonInput.value = "";
  cancelMeetingFormMessage.textContent = "";
  cancelMeetingDialog.showModal();
  cancelMeetingReasonInput.focus();
}

function closeCancelMeetingDialog() {
  pendingCancelAppointment = null;
  cancelMeetingFormMessage.textContent = "";
  cancelMeetingDialog.close();
}

async function reopenAppointment(appointmentId) {
  try {
    const response = await fetch(
      "/api/appointments/" + appointmentId + "/reopen",
      { method: "POST" }
    );
    const data = await getResponseData(response);
    teacherMessage.textContent = data.message;
    await loadAppointments();
    await loadUpcomingMeetings();
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

async function cancelApprovedMeeting(appointmentId, reason) {
  try {
    const response = await fetch(
      "/api/appointments/" + appointmentId + "/cancel",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      }
    );
    const data = await getResponseData(response);
    teacherMessage.textContent = data.message;
    await loadAppointments();
    await loadUpcomingMeetings();
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

async function updateAppointmentStatus(appointmentId, status, declineReason) {
  try {
    const response = await fetch(
      "/api/appointments/" + appointmentId + "/status",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          declineReason: declineReason || ""
        })
      }
    );
    const data = await getResponseData(response);
    teacherMessage.textContent = data.message;
    await loadAppointments();
    await loadUpcomingMeetings();
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

closeDeclineDialogButton.addEventListener("click", closeDeclineDialog);
cancelDeclineButton.addEventListener("click", closeDeclineDialog);
declineForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingDeclineAppointment) {
    return;
  }

  submitDeclineButton.disabled = true;
  declineFormMessage.textContent = "Declining request...";
  const appointment = pendingDeclineAppointment;
  const reason = declineReasonInput.value.trim();
  closeDeclineDialog();
  await updateAppointmentStatus(appointment.id, "Declined", reason);
  submitDeclineButton.disabled = false;
});

closeCancelMeetingDialogButton.addEventListener(
  "click",
  closeCancelMeetingDialog
);
keepMeetingButton.addEventListener("click", closeCancelMeetingDialog);
cancelMeetingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingCancelAppointment) {
    return;
  }

  submitCancelMeetingButton.disabled = true;
  cancelMeetingFormMessage.textContent = "Cancelling meeting...";
  const appointment = pendingCancelAppointment;
  const reason = cancelMeetingReasonInput.value.trim();
  closeCancelMeetingDialog();
  await cancelApprovedMeeting(appointment.id, reason);
  submitCancelMeetingButton.disabled = false;
});

scheduleTypeInput.addEventListener("change", updateScheduleFields);

openOfficeHourDialogButton.addEventListener("click", () => {
  resetOfficeHourForm();
  officeHourDialog.showModal();
});

closeOfficeHourDialogButton.addEventListener("click", () => {
  officeHourDialog.close();
});

officeHourForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  officeHourFormMessage.textContent = "Saving office hour...";
  const officeHourId = document.getElementById("office-hour-id").value;
  const data = {
    courseName: document.getElementById("course-name").value,
    scheduleType: scheduleTypeInput.value,
    dayOfWeek: dayInput.value,
    specificDate: dateInput.value,
    startTime: document.getElementById("start-time").value,
    endTime: document.getElementById("end-time").value,
    location: document.getElementById("location").value,
    meetingLink: document.getElementById("meeting-link").value,
    meetingMode: document.getElementById("meeting-mode").value,
    capacity: document.getElementById("capacity").value,
    timeZone: document.getElementById("time-zone").value
  };
  try {
    const response = await fetch(
      officeHourId
        ? "/api/office-hours/" + officeHourId
        : "/api/office-hours",
      {
        method: officeHourId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      }
    );
    const result = await getResponseData(response);
    officeHourDialog.close();
    teacherMessage.textContent = result.message;
    await loadOfficeHours();
  } catch (error) {
    officeHourFormMessage.textContent = error.message;
  }
});

appointmentFilter.addEventListener("change", () => {
  loadAppointments().catch((error) => {
    teacherMessage.textContent = error.message;
  });
});

refreshOfficeHoursButton.addEventListener("click", () => {
  Promise.all([loadOfficeHours(), loadAppointments()]).catch((error) => {
    teacherMessage.textContent = error.message;
  });
  loadUpcomingMeetings().catch((error) => {
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
    teacherWelcome.textContent = "Welcome, " + user.displayName;
    if (user.teacherSlug) {
      const link = document.createElement("a");
      link.href = "/teacher/" + encodeURIComponent(user.teacherSlug);
      link.textContent = "Share your public teacher profile link";
      teacherProfileLink.replaceChildren(link);
    }
    updateScheduleFields();
    await Promise.all([
      loadOfficeHours(),
      loadAppointments(),
      loadUpcomingMeetings()
    ]);
  } catch (error) {
    teacherMessage.textContent = error.message;
  }
}

initializeDashboard();
