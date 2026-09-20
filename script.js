// Mobile menu

function toggleMenu() {

  const menu = document.querySelector(".nav-links");

  menu.classList.toggle("active");

}


// AI Chat

function sendMessage() {

  const input = document.getElementById("userInput");
  const messages = document.getElementById("chatMessages");

  const text = input.value.trim();

  if (text === "") {
    return;
  }


  // User message

  const userMessage = document.createElement("div");

  userMessage.className = "message user-message";

  userMessage.textContent = text;

  messages.appendChild(userMessage);


  input.value = "";


  // Temporary AI response

  setTimeout(function () {

    const aiMessage = document.createElement("div");

    aiMessage.className = "message ai-message";

    aiMessage.textContent =
      "Thanks for your message! This is a demo AI response. Connect an AI API to make me a real AI assistant.";

    messages.appendChild(aiMessage);

    messages.scrollTop = messages.scrollHeight;

  }, 700);


  messages.scrollTop = messages.scrollHeight;

}


// Enter key

function handleEnter(event) {

  if (event.key === "Enter") {

    sendMessage();

  }

}


// Contact form

function submitContact(event) {

  event.preventDefault();

  const name = document.getElementById("name").value;

  alert(
    "Thank you " + name + "! Your message has been received."
  );

  event.target.reset();

}
