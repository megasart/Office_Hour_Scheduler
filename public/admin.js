const adminWelcome = document.getElementById("admin-welcome");
const adminMessage = document.getElementById("admin-message");
const feedbackFilter = document.getElementById("feedback-filter");
const feedbackList = document.getElementById("feedback-list");
const adminTeacherList = document.getElementById("admin-teacher-list");
const recentAppointments = document.getElementById("recent-appointments");
const logoutButton = document.getElementById("admin-logout-button");

function getElement(id) {
  return document.getElementById(id);
}

async function getResponseData(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request failed.");
  }
  return data;
}

function setAdminMessage(message, isError = false) {
  adminMessage.textContent = message;
  adminMessage.classList.toggle("is-error", isError);
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  return new Date(String(value).slice(0, 10) + "T12:00:00Z").toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }
  );
}

function createEmptyMessage(message) {
  const empty = document.createElement("p");
  empty.className = "muted-text";
  empty.textContent = message;
  return empty;
}

function renderTeachers(teachers) {
  adminTeacherList.replaceChildren();
  if (!teachers.length) {
    adminTeacherList.appendChild(createEmptyMessage("No teachers yet."));
    return;
  }

  teachers.forEach((teacher) => {
    const row = document.createElement("article");
    row.className = "admin-list-row";

    const name = document.createElement("strong");
    name.textContent = teacher.display_name;
    const details = document.createElement("p");
    details.textContent =
      (teacher.teacher_slug || "No profile code") +
      " · " +
      teacher.office_hour_count +
      " office hours · " +
      teacher.approved_count +
      " approved";

    row.append(name, details);
    adminTeacherList.appendChild(row);
  });
}

function renderRecentAppointments(appointments) {
  recentAppointments.replaceChildren();
  if (!appointments.length) {
    recentAppointments.appendChild(
      createEmptyMessage("No appointments have been requested yet.")
    );
    return;
  }

  appointments.forEach((appointment) => {
    const row = document.createElement("article");
    row.className = "admin-list-row";

    const name = document.createElement("strong");
    name.textContent = appointment.student_name || "Unnamed student";
    const details = document.createElement("p");
    details.textContent =
      (appointment.course_name || "Office hour") +
      " · " +
      (appointment.status || "Unknown") +
      " · " +
      formatDate(appointment.scheduled_date);
    const created = document.createElement("small");
    created.textContent = "Requested " + formatDateTime(appointment.created_at);

    row.append(name, details, created);
    recentAppointments.appendChild(row);
  });
}

async function loadOverview() {
  const response = await fetch("/api/admin/overview");
  const data = await getResponseData(response);
  getElement("stat-teachers").textContent = data.stats.teachers;
  getElement("stat-students").textContent = data.stats.students;
  getElement("stat-appointments").textContent = data.stats.appointments;
  getElement("stat-new-feedback").textContent = data.stats.new_feedback;
  renderTeachers(data.teachers);
  renderRecentAppointments(data.recentAppointments);
}

function buildFeedbackCard(feedback) {
  const card = document.createElement("article");
  card.className = "admin-feedback-card";
  if (feedback.status === "New") {
    card.classList.add("is-new");
  }

  const header = document.createElement("div");
  header.className = "admin-feedback-header";

  const heading = document.createElement("div");
  const category = document.createElement("h3");
  category.textContent = feedback.category;
  const rating = document.createElement("p");
  rating.className = "feedback-rating";
  rating.textContent = "★".repeat(feedback.rating) + "☆".repeat(5 - feedback.rating);
  rating.setAttribute("aria-label", feedback.rating + " out of 5 stars");
  heading.append(category, rating);

  const status = document.createElement("span");
  status.className = "feedback-status feedback-status-" + feedback.status.toLowerCase();
  status.textContent = feedback.status;
  header.append(heading, status);

  const message = document.createElement("p");
  message.className = "admin-feedback-message";
  message.textContent = feedback.message;

  const submittedBy = document.createElement("p");
  submittedBy.className = "admin-feedback-meta";
  const submitter = feedback.student_name || "Anonymous visitor";
  submittedBy.textContent = submitter + " · " + formatDateTime(feedback.created_at);

  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Admin note";
  const note = document.createElement("textarea");
  note.className = "admin-note-input";
  note.rows = 2;
  note.maxLength = 1000;
  note.placeholder = "Optional internal note";
  note.value = feedback.admin_note || "";
  noteLabel.appendChild(note);

  const actions = document.createElement("div");
  actions.className = "admin-feedback-actions";
  [
    ["New", "Mark new"],
    ["Read", "Mark read"],
    ["Archived", "Archive"]
  ].forEach(([statusValue, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small-button";
    button.textContent = label;
    button.disabled = feedback.status === statusValue;
    button.addEventListener("click", () => {
      updateFeedback(feedback.id, statusValue, note.value, button);
    });
    actions.appendChild(button);
  });

  card.append(header, message, submittedBy, noteLabel, actions);
  return card;
}

async function loadFeedback() {
  const status = feedbackFilter.value;
  const response = await fetch(
    "/api/admin/feedback?status=" + encodeURIComponent(status)
  );
  const feedback = await getResponseData(response);
  feedbackList.replaceChildren();

  if (!feedback.length) {
    feedbackList.appendChild(
      createEmptyMessage(
        status === "All" ? "No feedback has been submitted yet." : "No feedback matches this filter."
      )
    );
    return;
  }

  feedback.forEach((item) => feedbackList.appendChild(buildFeedbackCard(item)));
}

async function updateFeedback(id, status, adminNote, button) {
  button.disabled = true;
  setAdminMessage("Updating feedback...");

  try {
    const response = await fetch("/api/admin/feedback/" + id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status, adminNote })
    });
    await getResponseData(response);
    await Promise.all([loadOverview(), loadFeedback()]);
    setAdminMessage("Feedback updated.");
  } catch (error) {
    setAdminMessage(error.message, true);
    button.disabled = false;
  }
}

async function logOut() {
  logoutButton.disabled = true;
  try {
    await fetch("/api/logout", { method: "POST" });
  } finally {
    window.location.href = "/login.html";
  }
}

async function initializeAdminPage() {
  try {
    const response = await fetch("/api/me");
    const data = await getResponseData(response);
    if (!data.user || data.user.role !== "admin") {
      window.location.href = "/login.html";
      return;
    }

    adminWelcome.textContent = "Welcome, " + (data.user.displayName || "Administrator");
    await Promise.all([loadOverview(), loadFeedback()]);
  } catch (error) {
    window.location.href = "/login.html";
  }
}

feedbackFilter.addEventListener("change", () => {
  loadFeedback().catch((error) => setAdminMessage(error.message, true));
});
logoutButton.addEventListener("click", logOut);
initializeAdminPage();
