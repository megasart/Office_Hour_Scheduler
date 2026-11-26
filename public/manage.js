const manageTitle = document.getElementById("manage-title");
const manageMessage = document.getElementById("manage-message");
const appointmentDetails = document.getElementById("appointment-details");
const appointmentSummary = document.getElementById("appointment-summary");
const appointmentParticipants = document.getElementById("appointment-participants");
const cancelButton = document.getElementById("cancel-appointment");
const rescheduleSection = document.getElementById("reschedule-section");
const rescheduleOfficeHour = document.getElementById("reschedule-office-hour");
const rescheduleDate = document.getElementById("reschedule-date");
const submitRescheduleButton = document.getElementById("submit-reschedule");
const cancelDialog = document.getElementById("cancel-dialog");
const cancelForm = document.getElementById("cancel-form");
const cancelReason = document.getElementById("cancel-reason");
const cancelFormMessage = document.getElementById("cancel-form-message");
const closeCancelDialogButton = document.getElementById("close-cancel-dialog");
const keepAppointmentButton = document.getElementById("keep-appointment");
const submitCancelButton = document.getElementById("submit-cancel");

const token = window.location.pathname.split("/").filter(Boolean).pop();
let availableOfficeHours = [];

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
    return "";
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

function renderAppointment(appointment) {
  manageTitle.textContent =
    appointment.course_name + " office-hour request";
  appointmentSummary.replaceChildren();
  const schedule = document.createElement("p");
  schedule.textContent =
    "Status: " + appointment.status + " | " +
    formatDate(appointment.scheduled_date) + ", " +
    formatTime(appointment.start_time) + " - " +
    formatTime(appointment.end_time);
  const location = document.createElement("p");
  location.textContent =
    "Location: " + appointment.location + " / " +
    appointment.meeting_mode;
  const question = document.createElement("p");
  question.textContent =
    "Question: " + appointment.problem_description;
  const language = document.createElement("p");
  language.textContent = appointment.preferred_language
    ? "Language support requested: " + appointment.preferred_language
    : "No language support requested.";
  appointmentSummary.append(schedule, location, question, language);

  if (appointment.decline_reason) {
    const reason = document.createElement("p");
    reason.className = "decline-reason";
    reason.textContent =
      "Teacher message: " + appointment.decline_reason;
    appointmentSummary.appendChild(reason);
  }

  appointmentParticipants.replaceChildren();
  if (appointment.participants && appointment.participants.length > 0) {
    const heading = document.createElement("h3");
    heading.textContent = "Participants";
    appointmentParticipants.appendChild(heading);
    const list = document.createElement("ul");
    appointment.participants.forEach((participant) => {
      const item = document.createElement("li");
      item.textContent =
        participant.name + " (" + participant.participant_role + ")";
      list.appendChild(item);
    });
    appointmentParticipants.appendChild(list);
  }

  appointmentDetails.hidden = false;
  const canManage = ["Pending", "Approved"].includes(appointment.status);
  cancelButton.hidden = !canManage;
  rescheduleSection.hidden = !canManage;
}

function populateRescheduleOptions() {
  rescheduleOfficeHour.replaceChildren();
  availableOfficeHours.forEach((officeHour, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent =
      formatDate(officeHour.availability_date) + " | " +
      officeHour.course_name + " | " +
      formatTime(officeHour.start_time) + " - " +
      formatTime(officeHour.end_time);
    rescheduleOfficeHour.appendChild(option);
  });

  if (availableOfficeHours.length > 0) {
    rescheduleDate.value = availableOfficeHours[0].availability_date;
  }
}

rescheduleOfficeHour.addEventListener("change", () => {
  const officeHour = availableOfficeHours[Number(rescheduleOfficeHour.value)];
  if (officeHour) {
    rescheduleDate.value = officeHour.availability_date;
  }
});

cancelButton.addEventListener("click", () => {
  cancelReason.value = "";
  cancelFormMessage.textContent = "";
  cancelDialog.showModal();
  cancelReason.focus();
});

function closeCancelDialog() {
  cancelFormMessage.textContent = "";
  cancelDialog.close();
}

closeCancelDialogButton.addEventListener("click", closeCancelDialog);
keepAppointmentButton.addEventListener("click", closeCancelDialog);

cancelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitCancelButton.disabled = true;
  cancelFormMessage.textContent = "Cancelling appointment...";
  try {
    const response = await fetch("/api/manage/" + token + "/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: cancelReason.value.trim() })
    });
    const data = await getResponseData(response);
    cancelDialog.close();
    manageMessage.textContent = data.message;
    cancelButton.hidden = true;
    rescheduleSection.hidden = true;
  } catch (error) {
    cancelFormMessage.textContent = error.message;
  } finally {
    submitCancelButton.disabled = false;
  }
});

submitRescheduleButton.addEventListener("click", async () => {
  const officeHour = availableOfficeHours[Number(rescheduleOfficeHour.value)];
  if (!officeHour) {
    manageMessage.textContent = "Choose a new office-hour time.";
    return;
  }
  submitRescheduleButton.disabled = true;
  try {
    const response = await fetch("/api/manage/" + token + "/reschedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        officeHourId: officeHour.id,
        scheduledDate: rescheduleDate.value
      })
    });
    const data = await getResponseData(response);
    manageMessage.textContent = data.message;
  } catch (error) {
    manageMessage.textContent = error.message;
  } finally {
    submitRescheduleButton.disabled = false;
  }
});

async function initialize() {
  try {
    const appointmentResponse = await fetch("/api/manage/" + token);
    const appointment = await getResponseData(appointmentResponse);
    renderAppointment(appointment);

    const availabilityResponse = await fetch("/api/available-office-hours");
    availableOfficeHours = await getResponseData(availabilityResponse);
    populateRescheduleOptions();
  } catch (error) {
    manageTitle.textContent = "Appointment unavailable";
    manageMessage.textContent = error.message;
  }
}

initialize();
