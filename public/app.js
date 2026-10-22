const appointmentForm = document.getElementById("appointment-form");
const appointmentDialog = document.getElementById("appointment-dialog");

if (appointmentForm && appointmentDialog) {
  const requestButtons = document.querySelectorAll(".request-button");
  const closeDialogButton = document.querySelector(".dialog-close");
  const officeHourIdInput = document.getElementById("office-hour-id");
  const selectedCourseTeacher = document.getElementById(
    "selected-course-teacher"
  );
  const selectedTime = document.getElementById("selected-time");
  const selectedLocation = document.getElementById(
    "selected-location"
  );
  const message = document.getElementById("form-message");

  requestButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      appointmentForm.reset();
      officeHourIdInput.value = button.dataset.officeHourId;
      selectedCourseTeacher.textContent =
        button.dataset.officeHourTitle;

      selectedTime.textContent =
        button.dataset.officeHourTime;

      selectedLocation.textContent =
        button.dataset.officeHourLocation;
      message.textContent = "";

      appointmentDialog.showModal();
    });
  });

  closeDialogButton.addEventListener("click", () => {
    appointmentDialog.close();
  });

  appointmentDialog.addEventListener("click", (event) => {
    if (event.target === appointmentDialog) {
      appointmentDialog.close();
    }
  });

  appointmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const appointmentData = {
      officeHourId: Number(officeHourIdInput.value),
      assignment: document.getElementById("assignment").value,
      problemDescription: document
        .getElementById("problem")
        .value
        .trim(),
      meetingType: document.getElementById("meeting-type").value
    };

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(appointmentData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      message.textContent = data.message;
      appointmentForm.reset();
      officeHourIdInput.value = "";
    } catch (error) {
      console.error("Appointment submission failed:", error);
      message.textContent =
        error.message || "The appointment could not be submitted.";
    }
  });
}