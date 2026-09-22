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
  aiMessage.innerHTML = `
  <span class="ai-thinking">
    <span></span>
    <span></span>
    <span></span>
  </span>
`;
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

    addCopyButton(aiMessage);

  } catch (error) {
    aiMessage.textContent = "Error: " + error.message;
  }

  messages.scrollTop = messages.scrollHeight;
}

function addCopyButton(messageElement) {
  const button = document.createElement("button");

  button.textContent = "Copy";
  button.style.marginTop = "10px";
  button.style.padding = "7px 12px";
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";

  button.onclick = async function () {
    const text = messageElement.firstChild.textContent;

    await navigator.clipboard.writeText(text);

    button.textContent = "Copied ✓";

    setTimeout(() => {
      button.textContent = "Copy";
    }, 1500);
  };

  messageElement.appendChild(document.createElement("br"));
  messageElement.appendChild(button);
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

function clearChat() {
  const messages = document.getElementById("chatMessages");
  messages.innerHTML = "";
}
