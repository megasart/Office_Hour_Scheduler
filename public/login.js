const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const signupForm = document.getElementById("teacher-signup-form");
const signupMessage = document.getElementById("signup-message");
const signupSubmit = document.getElementById("signup-submit");

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.classList.toggle("success", type === "success");
  element.classList.toggle("error", type === "error");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    setMessage(loginMessage, "Enter your username and password.", "error");
    return;
  }

  setMessage(loginMessage, "Logging in...");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    if (data.user.role === "admin") {
      window.location.href = "/admin.html";
    } else if (data.user.role === "teacher") {
      window.location.href = "/teacher.html";
    } else {
      window.location.href = "/student.html";
    }
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const displayName = document
    .getElementById("teacher-display-name")
    .value.trim();
  const username = document
    .getElementById("teacher-username")
    .value.trim()
    .toLowerCase();
  const password = document.getElementById("teacher-password").value;
  const confirmPassword = document.getElementById(
    "teacher-password-confirm"
  ).value;

  if (displayName.length < 2) {
    setMessage(signupMessage, "Enter your name.", "error");
    document.getElementById("teacher-display-name").focus();
    return;
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,30}$/i.test(username)) {
    setMessage(
      signupMessage,
      "Use 3–31 letters, numbers, dots, underscores, or hyphens for your username.",
      "error"
    );
    document.getElementById("teacher-username").focus();
    return;
  }
  if (password.length < 8) {
    setMessage(signupMessage, "Your password must be at least 8 characters.", "error");
    document.getElementById("teacher-password").focus();
    return;
  }
  if (password !== confirmPassword) {
    setMessage(signupMessage, "The passwords do not match.", "error");
    document.getElementById("teacher-password-confirm").focus();
    return;
  }

  signupSubmit.disabled = true;
  setMessage(signupMessage, "Creating your teacher account...");

  try {
    const response = await fetch("/api/teacher-signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        displayName,
        username,
        password,
        confirmPassword
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The teacher account could not be created.");
    }

    signupForm.reset();
    document.getElementById("username").value = data.teacher.username;
    setMessage(signupMessage, data.message, "success");
    document.getElementById("password").focus();
  } catch (error) {
    setMessage(signupMessage, error.message, "error");
  } finally {
    signupSubmit.disabled = false;
  }
});
