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

function startVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Voice input is not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();

 recognition.lang = selectedLanguage;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = function(event) {
    const text = event.results[0][0].transcript;
    document.getElementById("userInput").value = text;
  };

  recognition.onerror = function(event) {
    alert("Voice error: " + event.error);
  };

  recognition.start();
}

// Rafi AI - Smooth chat experience
const chatMessages = document.getElementById("chat-messages");

if (chatMessages) {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

let selectedLanguage = "en-US";

document.querySelectorAll(".language-selector button").forEach(button => {
  button.addEventListener("click", function () {
    const language = this.textContent.trim();

    if (language === "English") {
      selectedLanguage = "en-US";
    } else if (language === "اردو") {
      selectedLanguage = "ur-PK";
    } else if (language === "हिन्दी") {
      selectedLanguage = "hi-IN";
    }

    document.querySelectorAll(".language-selector button").forEach(btn => {
      btn.classList.remove("active-language");
    });

    this.classList.add("active-language");
  });
});
// Save chat history
function saveChatHistory() {
  localStorage.setItem("rafiChatHistory", chatMessages.innerHTML);
}

// Load chat history
function loadChatHistory() {
  const savedChat = localStorage.getItem("rafiChatHistory");

  if (savedChat && chatMessages) {
    chatMessages.innerHTML = savedChat;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

loadChatHistory();

// Clear saved Rafi AI chat history
const clearChatButton = document.querySelector('[onclick="clearChat()"]');

if (clearChatButton) {
  clearChatButton.addEventListener("click", function () {
    localStorage.removeItem("rafiChatHistory");
  });
}

let liveCallConnection = null;
let liveCallStream = null;

async function startLiveCall() {
  try {
    const pc = new RTCPeerConnection();
    const selectedVoice = document.getElementById("liveVoice").value;

    liveCallConnection = pc;

    const audio = document.createElement("audio");
    audio.autoplay = true;

    pc.ontrack = function (event) {
      audio.srcObject = event.streams[0];
    };

    liveCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    liveCallStream.getTracks().forEach(function (track) {
      pc.addTrack(track, liveCallStream);
    });

    pc.createDataChannel("oai-events");

    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    const response = await fetch("/api/realtime", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Live Call شروع نہیں ہو سکی");
    }

    const answer = await response.text();

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answer
    });

    alert("Live Call شروع ہوگئی۔ آپ بول سکتے ہیں۔");

  } catch (error) {
    alert("Live Call Error: " + error.message);
  }
}
