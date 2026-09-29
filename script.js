const $ = (id) => document.getElementById(id);

const chatMessages = $("chatMessages");
const messageInput = $("messageInput");
const sendButton = $("sendButton");
const voiceButton = $("voiceButton");
const imageButton = $("imageButton");
const imageInput = $("imageInput");
const voiceSelect = $("voiceSelect");

let voices = [];
let recognition = null;
let listening = false;


/* =========================
   SYSTEM CLOCK
========================= */

function updateClock() {
  const el = $("systemTime");
  if (!el) return;

  el.textContent = new Date().toLocaleTimeString("en-US", {
    hour12: false
  });
}

setInterval(updateClock, 1000);
updateClock();


/* =========================
   CHAT UI
========================= */

function addMessage(text, type = "assistant") {
  if (!chatMessages) return;

  const wrapper = document.createElement("div");
  wrapper.className =
    type === "user"
      ? "message user-message"
      : "message assistant-message";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = type === "user" ? "U" : "R";

  const content = document.createElement("div");
  content.className = "message-content";

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = type === "user" ? "YOU" : "RAFI AI";

  const p = document.createElement("p");
  p.textContent = text;

  content.appendChild(label);
  content.appendChild(p);

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function showThinking() {
  const old = $("thinkingMessage");
  if (old) old.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "thinkingMessage";
  wrapper.className = "message assistant-message";

  wrapper.innerHTML = `
    <div class="message-avatar">R</div>
    <div class="message-content">
      <span class="message-label">RAFI AI</span>
      <p>Rafi سوچ رہا ہے...</p>
    </div>
  `;

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function removeThinking() {
  const el = $("thinkingMessage");
  if (el) el.remove();
}


/* =========================
   SEND MESSAGE
========================= */

async function sendMessage() {
  if (!messageInput) return;

  const message = messageInput.value.trim();

  if (!message) return;

  addMessage(message, "user");

  messageInput.value = "";
  messageInput.style.height = "auto";

  showThinking();

  sendButton?.setAttribute("disabled", "true");

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

    const data = await response.json().catch(() => ({}));

    removeThinking();

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Rafi AI request failed (${response.status})`
      );
    }

    const reply =
      data.reply ||
      "Rafi AI نے کوئی جواب واپس نہیں کیا۔";

    addMessage(reply, "assistant");

    speak(reply);

  } catch (error) {
    removeThinking();

    console.error("Rafi AI:", error);

    addMessage(
      error.message ||
      "Rafi AI سے رابطہ نہیں ہو سکا۔",
      "assistant"
    );
  } finally {
    sendButton?.removeAttribute("disabled");
    messageInput?.focus();
  }
}


/* =========================
   ENTER TO SEND
========================= */

messageInput?.addEventListener("keydown", (event) => {

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }

});


messageInput?.addEventListener("input", () => {

  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 120) + "px";

});


sendButton?.addEventListener("click", sendMessage);


/* =========================
   TEXT TO SPEECH
========================= */

function loadVoices() {

  if (!("speechSynthesis" in window)) return;

  voices = speechSynthesis.getVoices();

  if (!voiceSelect) return;

  voiceSelect.innerHTML =
    `<option value="">Voice</option>`;

  voices.forEach((voice, index) => {

    const option = document.createElement("option");

    option.value = index;

    option.textContent =
      `${voice.name} — ${voice.lang}`;

    voiceSelect.appendChild(option);

  });
}


if ("speechSynthesis" in window) {

  speechSynthesis.onvoiceschanged = loadVoices;

  loadVoices();

}


function speak(text) {

  if (!("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(text);

  const selected =
    voiceSelect?.value;

  if (
    selected !== "" &&
    voices[selected]
  ) {
    utterance.voice = voices[selected];
  }

  utterance.rate = 1;
  utterance.pitch = 1;

  speechSynthesis.speak(utterance);
}


/* =========================
   VOICE INPUT
========================= */

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {

  recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.lang = "ur-PK";

  recognition.onstart = () => {

    listening = true;

    voiceButton?.classList.add("active");

  };

  recognition.onend = () => {

    listening = false;

    voiceButton?.classList.remove("active");

  };

  recognition.onerror = (event) => {

    console.error(
      "Voice recognition:",
      event.error
    );

    listening = false;

    voiceButton?.classList.remove("active");

  };

  recognition.onresult = (event) => {

    const text =
      event.results[0][0].transcript;

    if (messageInput) {

      messageInput.value = text;

      messageInput.dispatchEvent(
        new Event("input")
      );

    }

  };

}


voiceButton?.addEventListener("click", () => {

  if (!recognition) {

    addMessage(
      "اس موبائل براؤزر میں voice recognition دستیاب نہیں ہے۔",
      "assistant"
    );

    return;

  }

  if (listening) {

    recognition.stop();

  } else {

    recognition.lang = "ur-PK";

    recognition.start();

  }

});


/* =========================
   IMAGE INPUT
========================= */

imageButton?.addEventListener("click", () => {
  imageInput?.click();
});


imageInput?.addEventListener("change", () => {

  const file = imageInput.files?.[0];

  if (!file) return;

  addMessage(
    `Image منتخب ہوئی: ${file.name}`,
    "user"
  );

  addMessage(
    "Image input تیار ہے۔ Image analysis endpoint سے مکمل connection اگلے مرحلے میں فعال کیا جا سکتا ہے۔",
    "assistant"
  );

});


/* =========================
   CLEAR CHAT
========================= */

$("clearChat")?.addEventListener(
  "click",
  () => {

    if (!chatMessages) return;

    chatMessages.innerHTML = "";

    addMessage(
      "چیٹ صاف ہو گئی۔ بتائیں، اب کیا کرنا ہے؟",
      "assistant"
    );

  }
);


/* =========================
   SAVE CHAT
========================= */

$("saveChat")?.addEventListener(
  "click",
  () => {

    if (!chatMessages) return;

    const text =
      [...chatMessages.querySelectorAll(".message")]
        .map((message) =>
          message.innerText.trim()
        )
        .join("\n\n");

    const blob =
      new Blob([text], {
        type: "text/plain;charset=utf-8"
      });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = "rafi-ai-chat.txt";

    link.click();

    URL.revokeObjectURL(url);

  }
);


/* =========================
   MOBILE / LEFT NAVIGATION
========================= */

document.querySelectorAll(
  "[data-target]"
).forEach((button) => {

  button.addEventListener(
    "click",
    () => {

      const target =
        document.getElementById(
          button.dataset.target
        );

      if (!target) return;

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      document.querySelectorAll(
        ".nav-command"
      ).forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

    }
  );

});


/* =========================
   TOOL FORMS
========================= */

async function submitToolForm(
  form,
  endpoint,
  resultElement,
  payloadBuilder
) {

  form?.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const result =
        document.getElementById(
          resultElement
        );

      if (!result) return;

      result.textContent =
        "Rafi process کر رہا ہے...";

      try {

        const response =
          await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(
              payloadBuilder()
            )
          });

        const data =
          await response.json()
            .catch(() => ({}));

        if (!response.ok) {

          throw new Error(
            data.error ||
            `Request failed (${response.status})`
          );

        }

        result.textContent =
          data.reply ||
          data.message ||
          "Process مکمل ہو گیا۔";

      } catch (error) {

        console.error(error);

        result.textContent =
          error.message ||
          "Module سے رابطہ نہیں ہو سکا۔";

      }

    }
  );

}


/* PRODUCT RESEARCH */

submitToolForm(
  $("productResearchForm"),
  "/api/productResearch",
  "productResearchResult",
  () => ({
    product:
      $("productName")?.value.trim(),

    market:
      $("targetMarket")?.value.trim()
  })
);


/* SUPPLIER RESEARCH */

submitToolForm(
  $("supplierResearchForm"),
  "/api/supplierResearch",
  "supplierResearchResult",
  () => ({
    product:
      $("supplierProduct")?.value.trim(),

    quantity:
      Number(
        $("supplierQuantity")?.value || 0
      )
  })
);


/* ORDER APPROVAL */

submitToolForm(
  $("orderApprovalForm"),
  "/api/orderApproval",
  "orderApprovalResult",
  () => ({
    product:
      $("approvalProduct")?.value.trim(),

    cost:
      Number(
        $("approvalCost")?.value || 0
      ),

    profit:
      Number(
        $("approvalProfit")?.value || 0
      )
  })
);


/* SUPPLIER CONVERSATION */

submitToolForm(
  $("supplierConversationForm"),
  "/api/supplierConversation",
  "supplierConversationResult",
  () => ({
    message:
      $("supplierMessage")?.value.trim()
  })
);


/* =========================
   LIVE BUTTON
========================= */

$("liveCallButton")?.addEventListener(
  "click",
  () => {

    addMessage(
      "Live AI mode کا interface تیار ہے۔ مکمل realtime voice connection اگلے integration مرحلے میں فعال کیا جائے گا۔",
      "assistant"
    );

  }
);


/* =========================
   INITIAL STATE
========================= */

window.addEventListener(
  "load",
  () => {

    messageInput?.focus();

  }
);
