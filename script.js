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
    const response = await fetch("/api/Chat", {
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

  const input = getElement("userInput");

  if (!input) return;

  input.value = text;
  input.focus();
}

/* =========================
   SAVE CHAT
========================= */

function exportChat() {

  const container = getElement("chatMessages");

  if (!container) return;

  const text = container.innerText;

  const blob = new Blob(
    [text],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "Rafi-AI-chat.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/* =========================
   CONTACT
========================= */

function submitContact(event) {

  event.preventDefault();

  alert("آپ کا پیغام محفوظ کر لیا گیا ہے۔");

  event.target.reset();
}

/* =========================
   PRODUCT RESEARCH
========================= */

async function researchProduct() {

  const productName =
    getElement("productName")?.value.trim();

  const supplierPrice =
    getElement("supplierPrice")?.value;

  const shippingCost =
    getElement("shippingCost")?.value;

  const sellingPrice =
    getElement("sellingPrice")?.value;

  const competition =
    getElement("competition")?.value.trim();

  if (!productName) {
    showResult(
      "researchResult",
      `<div class="research-output">
        Product name ضروری ہے۔
      </div>`
    );
    return;
  }

  showResult(
    "researchResult",
    `<div class="research-output">
      Rafi AI research کر رہا ہے...
    </div>`
  );

  try {

    const response = await fetch(
      "/api/productResearch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          supplierPrice,
          shippingCost,
          sellingPrice,
          competition
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Research failed");
    }

    showResult(
      "researchResult",
      `
      <div class="research-output">

        <h3>Product Research Result</h3>

        <p><strong>Product:</strong> ${escapeHtml(data.product)}</p>

        <p><strong>Supplier Price:</strong> $${data.supplierPrice}</p>

        <p><strong>Shipping:</strong> $${data.shippingCost}</p>

        <p><strong>Total Cost:</strong> $${data.totalCost}</p>

        <p><strong>Selling Price:</strong> $${data.sellingPrice}</p>

        <p><strong>Profit:</strong> $${data.profit}</p>

        <p><strong>Profit Margin:</strong> ${data.profitMargin}%</p>

        <p><strong>Competition:</strong> ${escapeHtml(data.competition)}</p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "researchResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   SUPPLIER RESEARCH
========================= */

async function researchSupplier() {

  const supplierName =
    getElement("supplierName")?.value.trim();

  const productName =
    getElement("supplierProduct")?.value.trim();

  const unitPrice =
    getElement("unitPrice")?.value;

  const shippingCost =
    getElement("supplierShipping")?.value;

  const moq =
    getElement("moq")?.value;

  const stock =
    getElement("stock")?.value.trim();

  const deliveryTime =
    getElement("deliveryTime")?.value.trim();

  if (!supplierName || !productName) {

    showResult(
      "supplierResult",
      `<div class="research-output">
        Supplier name اور product name ضروری ہیں۔
      </div>`
    );

    return;
  }

  showResult(
    "supplierResult",
    `<div class="research-output">
      Supplier check ہو رہا ہے...
    </div>`
  );

  try {

    const response = await fetch(
      "/api/supplierResearch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          supplierName,
          productName,
          unitPrice,
          shippingCost,
          moq,
          stock,
          deliveryTime
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Supplier research failed");
    }

    showResult(
      "supplierResult",
      `
      <div class="research-output">

        <h3>Supplier Result</h3>

        <p><strong>Supplier:</strong> ${escapeHtml(data.supplier)}</p>

        <p><strong>Product:</strong> ${escapeHtml(data.product)}</p>

        <p><strong>Unit Price:</strong> $${data.unitPrice}</p>

        <p><strong>Shipping:</strong> $${data.shippingCost}</p>

        <p><strong>Estimated Unit Cost:</strong> $${data.estimatedUnitCost}</p>

        <p><strong>MOQ:</strong> ${data.minimumOrderQuantity}</p>

        <p><strong>Stock:</strong> ${escapeHtml(data.stock)}</p>

        <p><strong>Delivery:</strong> ${escapeHtml(data.deliveryTime)}</p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "supplierResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   ORDER APPROVAL
========================= */

async function checkApproval() {

  const productName =
    getElement("approvalProduct")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  const unitCost =
    getElement("approvalUnitCost")?.value;

  const shipping =
    getElement("approvalShipping")?.value;

  const selling =
    getElement("approvalSelling")?.value;

  if (!productName) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        Product name ضروری ہے۔
      </div>`
    );

    return;
  }

  try {

    const response = await fetch(
      "/api/approval",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          unitCost,
          shippingCost: shipping,
          sellingPrice: selling
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Approval check failed");
    }

    orderApproved = false;

    showResult(
      "approvalResult",
      `
      <div class="research-output">

        <h3>Order Review</h3>

        <p><strong>Product:</strong> ${escapeHtml(data.productName)}</p>

        <p><strong>Quantity:</strong> ${data.quantity}</p>

        <p><strong>Total Cost:</strong> $${data.totalCost}</p>

        <p><strong>Total Revenue:</strong> $${data.totalRevenue}</p>

        <p><strong>Estimated Profit:</strong> $${data.estimatedProfit}</p>

        <p><strong>Status:</strong> ${escapeHtml(data.status)}</p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   PREPARE ORDER
========================= */

async function prepareOrder() {

  const productName =
    getElement("approvalProduct")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  const supplierPrice =
    getElement("approvalUnitCost")?.value;

  const shippingCost =
    getElement("approvalShipping")?.value;

  const sellingPrice =
    getElement("approvalSelling")?.value;

  const supplierName =
    getElement("approvalSupplierName")?.value.trim();

  if (!productName || !supplierName) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        Product اور Supplier name ضروری ہیں۔
      </div>`
    );

    return;
  }

  try {

    const response = await fetch(
      "/api/order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          supplierPrice,
          shippingCost,
          sellingPrice,
          stock: "Not provided",
          deliveryTime: "Not provided"
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Order preparation failed");
    }

    orderApproved = false;

    showResult(
      "approvalResult",
      `
      <div class="research-output">

        <h3>Order Prepared</h3>

        <p><strong>Product:</strong> ${escapeHtml(data.productName)}</p>

        <p><strong>Quantity:</strong> ${data.quantity}</p>

        <p><strong>Total Cost:</strong> $${data.totalCost}</p>

        <p><strong>Total Revenue:</strong> $${data.totalRevenue}</p>

        <p><strong>Estimated Profit:</strong> $${data.estimatedProfit}</p>

        <p><strong>Status:</strong> ${escapeHtml(data.status)}</p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   APPROVE ORDER
========================= */

async function approveOrder() {

  const productName =
    getElement("approvalProduct")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  if (!productName) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        پہلے Order check کریں۔
      </div>`
    );

    return;
  }

  try {

    const response = await fetch(
      "/api/orderApproval",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          totalCost: getApprovalTotalCost(),
          action: "approve"
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Approval failed");
    }

    orderApproved = true;

    showResult(
      "approvalResult",
      `
      <div class="research-output">

        <h3>✓ Order Approved</h3>

        <p>
          آپ نے اس Order کو approve کر دیا ہے۔
        </p>

        <p>
          Supplier order ابھی automatically place نہیں کیا گیا۔
        </p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   REJECT ORDER
========================= */

async function rejectOrder() {

  const productName =
    getElement("approvalProduct")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  if (!productName) return;

  try {

    const response = await fetch(
      "/api/orderApproval",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          totalCost: getApprovalTotalCost(),
          action: "reject"
        })
      }
    );

    const data = await response.json();

    orderApproved = false;

    showResult(
      "approvalResult",
      `
      <div class="research-output">

        <h3>Order Rejected</h3>

        <p>${escapeHtml(data.status || "Order rejected")}</p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   TOTAL COST
========================= */

function getApprovalTotalCost() {

  const quantity =
    Number(getElement("approvalQuantity")?.value || 0);

  const unitCost =
    Number(getElement("approvalUnitCost")?.value || 0);

  const shipping =
    Number(getElement("approvalShipping")?.value || 0);

  return Number(
    ((unitCost + shipping) * quantity).toFixed(2)
  );
}

/* =========================
   SUPPLIER ORDER
========================= */

async function prepareSupplierOrder() {

  const productName =
    getElement("approvalProduct")?.value.trim();

  const supplierName =
    getElement("approvalSupplierName")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  const totalCost =
    getApprovalTotalCost();

  if (!productName || !supplierName) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        Product اور Supplier name ضروری ہیں۔
      </div>`
    );

    return;
  }

  try {

    const response = await fetch(
      "/api/supplierOrder",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          supplierName,
          totalCost,
          approved: orderApproved
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Supplier order failed");
    }

    showResult(
      "approvalResult",
      `
      <div class="research-output">

        <h3>Supplier Order Ready</h3>

        <p><strong>Supplier:</strong> ${escapeHtml(data.supplierName)}</p>

        <p><strong>Product:</strong> ${escapeHtml(data.productName)}</p>

        <p><strong>Quantity:</strong> ${data.quantity}</p>

        <p><strong>Total Cost:</strong> $${data.totalCost}</p>

        <p>
          ${escapeHtml(data.status)}
        </p>

      </div>
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      `<div class="research-output">
        ${escapeHtml(error.message)}
      </div>`
    );
  }
}

/* =========================
   SUPPLIER CONVERSATION
========================= */

async function sendSupplierMessage() {

  const input =
    getElement("supplierChatMessage");

  const result =
    getElement("supplierChatResult");

  if (!input || !result) return;

  const message = input.value.trim();

  if (!message) return;

  result.innerHTML = `
    <div class="research-output">
      Rafi AI supplier message تیار کر رہا ہے...
    </div>
  `;

  try {

    const response = await fetch(
      "/api/supplierConversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId: supplierConversationId,
          message
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Supplier conversation failed"
      );
    }

    supplierConversationId =
      data.conversationId || supplierConversationId;

    result.innerHTML = `
      <div class="research-output">

        <h3>Rafi AI Reply</h3>

        <p>${escapeHtml(data.reply || "")}</p>

      </div>
    `;

  } catch (error) {

    result.innerHTML = `
      <div class="research-output">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/* =========================
   IMAGE
========================= */

async function editImage() {

  const input = getElement("imageInput");

  if (!input || !input.files.length) {

    alert("پہلے ایک image منتخب کریں۔");

    return;
  }

  alert(
    "Image selected۔ Image editing API اگلے مرحلے میں connect کیا جائے گا۔"
  );
}

/* =========================
   LIVE CALL
========================= */

async function startLiveCall() {

  alert(
    "Live Voice mode موجود ہے۔ Browser microphone permission مانگ سکتا ہے۔"
  );

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      return;
    }

    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    stream.getTracks().forEach(track => {
      track.stop();
    });

  } catch (error) {

    console.error("Microphone permission:", error);
  }
}

/* =========================
   IMAGE INPUT
========================= */

function setupImageInput() {

  const input = getElement("imageInput");

  if (!input) return;

  input.addEventListener(
    "change",
    function () {

      if (input.files.length) {

        const file =
          input.files[0];

        addMessage(
          "user",
          `📷 Image selected: ${file.name}`
        );
      }

    }
  );
}

/* =========================
   INITIALIZE
========================= */

function initializeRafiAI() {

  setupImageInput();

  const input = getElement("userInput");

  if (input) {

    input.addEventListener(
      "input",
      function () {

        input.style.height = "auto";

        input.style.height =
          Math.min(input.scrollHeight, 140) + "px";
      }
    );
  }

  console.log("Rafi AI initialized successfully.");
}

document.addEventListener(
  "DOMContentLoaded",
  initializeRafiAI
);

/* ================================
   RAFI VOICE ASSISTANT
   Wake phrase: "Hi Rafi"
================================ */

let rafiWakeRecognition = null;
let rafiCommandRecognition = null;
let rafiVoiceActive = false;

function startRafiVoiceAssistant() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("آپ کے browser میں voice recognition support نہیں ہے۔ Chrome استعمال کریں۔");
    return;
  }

  if (rafiVoiceActive) return;

  rafiVoiceActive = true;

  rafiWakeRecognition = new SpeechRecognition();
  rafiWakeRecognition.lang = "en-US";
  rafiWakeRecognition.continuous = true;
  rafiWakeRecognition.interimResults = false;

  rafiWakeRecognition.onresult = function (event) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;

      const text = event.results[i][0].transcript
        .trim()
        .toLowerCase();

      if (
        text.includes("hi rafi") ||
        text.includes("hey rafi") ||
        text.includes("ہائی رافی") ||
        text.includes("ہی رافی")
      ) {
        speakReply("Yes, I'm listening.");
        startRafiCommandListening();
        return;
      }
    }
  };

  rafiWakeRecognition.onerror = function () {
    if (rafiVoiceActive) {
      setTimeout(startRafiVoiceAssistant, 1000);
    }
  };

  rafiWakeRecognition.onend = function () {
    if (rafiVoiceActive) {
      setTimeout(() => {
        try {
          rafiWakeRecognition.start();
        } catch (e) {}
      }, 500);
    }
  };

  try {
    rafiWakeRecognition.start();
    speakReply("Rafi voice assistant is ready.");
  } catch (e) {}
}


function startRafiCommandListening() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) return;

  if (rafiCommandRecognition) {
    try {
      rafiCommandRecognition.stop();
    } catch (e) {}
  }

  rafiCommandRecognition = new SpeechRecognition();
  rafiCommandRecognition.lang = "en-US";
  rafiCommandRecognition.continuous = false;
  rafiCommandRecognition.interimResults = false;

  rafiCommandRecognition.onresult = function (event) {
    const command =
      event.results[0][0].transcript.trim();

    const input = document.getElementById("userInput");

    if (input) {
      input.value = command;

      if (typeof sendMessage === "function") {
        sendMessage();
      }
    }
  };

  rafiCommandRecognition.onerror = function () {
    speakReply("I didn't hear that. Please try again.");
  };

  try {
    rafiCommandRecognition.start();
  } catch (e) {}
}


function stopRafiVoiceAssistant() {
  rafiVoiceActive = false;

  try {
    if (rafiWakeRecognition) {
      rafiWakeRecognition.stop();
    }
  } catch (e) {}

  try {
    if (rafiCommandRecognition) {
      rafiCommandRecognition.stop();
    }
  } catch (e) {}
}


/* Start voice assistant when page is loaded */
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(() => {
    startRafiVoiceAssistant();
  }, 1500);
});
