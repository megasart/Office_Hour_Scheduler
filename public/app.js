const appointmentForm = document.getElementById("appointment-form");

if (appointmentForm) {
  appointmentForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const message = document.getElementById("form-message");

    message.textContent = "Your appointment request was submitted for review. " +
      "Database saving will be added next.";

    appointmentForm.reset();
  });
}
