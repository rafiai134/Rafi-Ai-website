async function sendMessage() {
  const input = document.getElementById("userInput");
  const messages = document.getElementById("chatMessages");
  const text = input.value.trim();

  if (text === "") return;

  const userMessage = document.createElement("div");
  userMessage.className = "message user-message";
  userMessage.textContent = text;
  messages.appendChild(userMessage);

  input.value = "";

  const aiMessage = document.createElement("div");
  aiMessage.className = "message ai-message";
  aiMessage.textContent = "Thinking...";
  messages.appendChild(aiMessage);

  messages.scrollTop = messages.scrollHeight;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    aiMessage.textContent = data.reply;

  } catch (error) {
    aiMessage.textContent = "Error: " + error.message;
  }

  messages.scrollTop = messages.scrollHeight;
}

function toggleMenu() {
  const menu = document.querySelector(".nav-links");
  menu.classList.toggle("active");
}

function handleEnter(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
}

function submitContact(event) {
  event.preventDefault();

  const name = document.getElementById("name").value;

  alert("Thank you " + name + "! Your message has been received.");

  event.target.reset();
}
