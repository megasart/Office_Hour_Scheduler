const feedbackForm = document.getElementById("feedback-form");
const feedbackCategoryInput = document.getElementById("feedback-category");
const feedbackRatingInput = document.getElementById("feedback-rating");
const feedbackNameInput = document.getElementById("feedback-name");
const feedbackMessageInput = document.getElementById("feedback-message");
const feedbackWebsiteInput = document.getElementById("feedback-website");
const feedbackSubmitButton = document.getElementById("feedback-submit");
const feedbackFormMessage = document.getElementById("feedback-form-message");
const returnButton = document.getElementById("return-button");

returnButton.addEventListener("click", () => {
  let cameFromThisSite = false;
  try {
    cameFromThisSite =
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
  } catch (error) {
    cameFromThisSite = false;
  }

  if (cameFromThisSite && window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
});

async function getResponseData(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request failed.");
  }
  return data;
}

function setFeedbackFormMessage(message, isError = false) {
  feedbackFormMessage.textContent = message;
  feedbackFormMessage.classList.toggle("is-error", isError);
}

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedbackFormMessage("");

  if (!feedbackRatingInput.value) {
    setFeedbackFormMessage("Choose a rating before sending feedback.", true);
    feedbackRatingInput.focus();
    return;
  }

  if (feedbackMessageInput.value.trim().length < 10) {
    setFeedbackFormMessage(
      "Please enter at least 10 characters of feedback.",
      true
    );
    feedbackMessageInput.focus();
    return;
  }

  feedbackSubmitButton.disabled = true;
  setFeedbackFormMessage("Sending feedback...");

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        category: feedbackCategoryInput.value,
        rating: feedbackRatingInput.value,
        studentName: feedbackNameInput.value,
        message: feedbackMessageInput.value,
        website: feedbackWebsiteInput.value
      })
    });
    const data = await getResponseData(response);
    feedbackForm.reset();
    feedbackCategoryInput.value = "General";
    setFeedbackFormMessage(data.message);
  } catch (error) {
    setFeedbackFormMessage(error.message, true);
  } finally {
    feedbackSubmitButton.disabled = false;
  }
});
