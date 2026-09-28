let supplierConversationId = null;
let orderApproved = false;

/* =========================
   BASIC HELPERS
========================= */

function getElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showResult(id, html) {
  const element = getElement(id);
  if (element) element.innerHTML = html;
}

/* =========================
   MENU
========================= */

function toggleMenu() {
  const nav = document.querySelector(".nav-links");

  if (!nav) return;

  if (nav.style.display === "flex") {
    nav.style.display = "";
  } else {
    nav.style.display = "flex";
    nav.style.flexDirection = "column";
    nav.style.position = "absolute";
    nav.style.top = "72px";
    nav.style.right = "15px";
    nav.style.padding = "15px";
    nav.style.borderRadius = "15px";
    nav.style.background = "#111529";
    nav.style.border = "1px solid rgba(255,255,255,.1)";
  }
}

/* =========================
   CHAT
========================= */

function addMessage(role, text) {
  const container = getElement("chatMessages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = escapeHtml(text);

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const input = getElement("userInput");
  if (!input) return;

  const message = input.value.trim();

  if (!message) return;

  addMessage("user", message);
  input.value = "";

  addMessage("assistant", "Rafi AI سوچ رہا ہے...");

  const messages = getElement("chatMessages");
  const thinkingMessage = messages?.lastElementChild;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message
      })
    });

    const data = await response.json();

    if (thinkingMessage) {
      thinkingMessage.remove();
    }

    if (!response.ok) {
      throw new Error(data.error || "AI request failed");
    }

    const reply = data.reply || "مجھے کوئی جواب نہیں ملا۔";

    addMessage("assistant", reply);

    speakReply(reply);

  } catch (error) {

    if (thinkingMessage) {
      thinkingMessage.remove();
    }

    addMessage(
      "assistant",
      "معذرت، Rafi AI سے رابطہ نہیں ہو سکا۔ دوبارہ کوشش کریں۔"
    );

    console.error(error);
  }
}

function handleEnter(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

/* =========================
   VOICE INPUT
========================= */

function startVoice() {

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("آپ کے browser میں Voice Input support موجود نہیں۔");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "ur-PK";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = function () {
    const input = getElement("userInput");

    if (input) {
      input.placeholder = "سن رہا ہوں...";
    }
  };

  recognition.onresult = function (event) {

    const text =
      event.results[0][0].transcript;

    const input = getElement("userInput");

    if (input) {
      input.value = text;
      input.focus();
    }
  };

  recognition.onerror = function (event) {
    console.error("Voice error:", event.error);
  };

  recognition.onend = function () {

    const input = getElement("userInput");

    if (input) {
      input.placeholder = "Message Rafi AI";
    }
  };

  recognition.start();
}

/* =========================
   AI VOICE OUTPUT
========================= */

function speakReply(text) {

  if (!("speechSynthesis" in window)) {
    return;
  }

  const cleanText = String(text)
    .replace(/[*#_`]/g, "");

  const speech =
    new SpeechSynthesisUtterance(cleanText);

  speech.lang = "ur-PK";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
}

/* =========================
   CLEAR CHAT
========================= */

function clearChat() {

  const container = getElement("chatMessages");

  if (!container) return;

  container.innerHTML = `
    <div class="rafi-welcome">

      <div class="welcome-avatar">
        R
      </div>

      <h2>
        Hi, I am your <span>Rafi</span>
      </h2>

      <p>
        How can I help you today?
      </p>

      <div class="suggestions">

        <button
          type="button"
          onclick="setSuggestion('Help me find a profitable product for Shopify')"
        >
          💡 Find a product
        </button>

        <button
          type="button"
          onclick="setSuggestion('Help me with my e-commerce business')"
        >
          🛒 E-commerce help
        </button>

        <button
          type="button"
          onclick="setSuggestion('Give me a business idea')"
        >
          ✨ Business idea
        </button>

      </div>

    </div>
  `;
}

function setSuggestion(text) {

  const input = getElement("user
