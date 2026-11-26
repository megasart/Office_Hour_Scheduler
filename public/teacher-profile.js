const teacherName = document.getElementById("teacher-name");
const teacherSummary = document.getElementById("teacher-summary");
const teacherCode = document.getElementById("teacher-code");
const profileMessage = document.getElementById("profile-message");
const profileCalendar = document.getElementById("profile-calendar");
const profileOfficeHours = document.getElementById("profile-office-hours");

let teacherSlug = "";
let availableOfficeHours = [];
let calendarMonth = new Date();
calendarMonth.setDate(1);

function formatTime(timeValue) {
  if (!timeValue) {
    return "";
  }

  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return displayHour + ":" + String(minutes).padStart(2, "0") + " " + suffix;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Date(String(dateValue).slice(0, 10) + "T12:00:00Z")
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
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

function renderTeacherInformation(officeHours) {
  profileOfficeHours.replaceChildren();
  const details = new Map();
  officeHours.forEach((officeHour) => {
    const key = [
      officeHour.course_name,
      officeHour.location,
      officeHour.meeting_mode
    ].join("|");
    if (!details.has(key)) {
      details.set(key, officeHour);
    }
  });

  if (details.size === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No active office-hour information is available yet.";
    profileOfficeHours.appendChild(empty);
    return;
  }

  details.forEach((officeHour) => {
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
    profileOfficeHours.appendChild(card);
  });
}

function renderAvailabilityCalendar() {
  profileCalendar.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "calendar-toolbar";
  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "calendar-nav-button";
  previousButton.textContent = "‹";
  previousButton.setAttribute("aria-label", "Previous month");
  previousButton.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderAvailabilityCalendar();
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
    renderAvailabilityCalendar();
  });

  const todayButton = document.createElement("button");
  todayButton.type = "button";
  todayButton.className = "small-button calendar-today-button";
  todayButton.textContent = "Today";
  todayButton.addEventListener("click", () => {
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    renderAvailabilityCalendar();
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

    availableOfficeHours
      .filter((officeHour) => officeHour.availability_date === date)
      .forEach((officeHour) => {
        const event = document.createElement("a");
        event.className = "calendar-event";
        event.href =
          "/student.html?teacher=" + encodeURIComponent(teacherSlug) +
          "&officeHour=" + encodeURIComponent(officeHour.id) +
          "&date=" + encodeURIComponent(date);
        event.textContent =
          formatTime(officeHour.start_time) + " " + officeHour.course_name;
        event.setAttribute(
          "aria-label",
          formatDate(date) + ", " +
            formatTime(officeHour.start_time) + " - " +
            formatTime(officeHour.end_time) + ", " +
            officeHour.course_name
        );
        cellElement.appendChild(event);
      });

    grid.appendChild(cellElement);
  }

  profileCalendar.append(toolbar, weekdays, grid);
}

async function loadTeacherProfile() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  teacherSlug = pathParts[pathParts.length - 1];

  const profileResponse = await fetch(
    "/api/teachers/" + encodeURIComponent(teacherSlug)
  );
  const profile = await getResponseData(profileResponse);
  teacherName.textContent = profile.teacher.display_name;
  teacherCode.textContent = "Teacher code: " + profile.teacher.teacher_slug;
  teacherSummary.textContent =
    "Choose a time from the calendar to request an office-hour meeting with " +
    profile.teacher.display_name + ".";
  renderTeacherInformation(profile.officeHours);

  const availabilityResponse = await fetch(
    "/api/available-office-hours?teacher=" +
      encodeURIComponent(teacherSlug)
  );
  availableOfficeHours = await getResponseData(availabilityResponse);
  renderAvailabilityCalendar();
  if (availableOfficeHours.length === 0) {
    profileMessage.textContent =
      "This teacher does not have any open office-hour times yet.";
  }
}

loadTeacherProfile().catch((error) => {
  teacherName.textContent = "Teacher Profile";
  profileMessage.textContent = error.message;
});
