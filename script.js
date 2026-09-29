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

  if (element) {
    element.innerHTML = html;
  }
}


/* =========================
   MOBILE MENU
========================= */

function toggleMenu() {
  const links = document.querySelector(".nav-links");

  if (!links) return;

  if (links.style.display === "flex") {
    links.style.display = "";
  } else {
    links.style.display = "flex";
    links.style.flexDirection = "column";
    links.style.position = "absolute";
    links.style.top = "75px";
    links.style.right = "5%";
    links.style.padding = "18px";
    links.style.border = "1px solid rgba(120,150,255,.18)";
    links.style.borderRadius = "16px";
    links.style.background = "rgba(8,12,27,.96)";
    links.style.backdropFilter = "blur(20px)";
  }
}


/* =========================
   CHAT
========================= */

function addMessage(role, text) {
  const container = getElement("chatMessages");

  if (!container) return;

  const message = document.createElement("div");

  message.className = `chat-message ${role}`;

  message.innerHTML = escapeHtml(text);

  container.appendChild(message);

  container.scrollTop = container.scrollHeight;
}


async function sendMessage() {

  const input = getElement("userInput");

  if (!input) return;

  const message = input.value.trim();

  if (!message) return;

  addMessage("user", message);

  input.value = "";

  const loading = document.createElement("div");

  loading.className = "chat-message assistant";

  loading.id = "rafi-loading";

  loading.textContent = "Rafi سوچ رہا ہے...";

  const container = getElement("chatMessages");

  if (container) {
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;
  }

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

    const oldLoading = getElement("rafi-loading");

    if (oldLoading) {
      oldLoading.remove();
    }

    if (!response.ok) {
      throw new Error(
        data.error || "Rafi AI request failed"
      );
    }

    const reply =
      data.reply ||
      data.output_text ||
      "مجھے ابھی جواب نہیں ملا۔";

    addMessage("assistant", reply);

    speakReply(reply);

  } catch (error) {

    const oldLoading = getElement("rafi-loading");

    if (oldLoading) {
      oldLoading.remove();
    }

    addMessage(
      "assistant",
      "معذرت، Rafi AI سے رابطہ نہیں ہو سکا۔ دوبارہ کوشش کریں۔"
    );

    console.error("Rafi Chat Error:", error);
  }
}


function handleEnter(event) {

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    sendMessage();
  }
}


/* =========================
   VOICE
========================= */

let recognition = null;
let isListening = false;

function startVoice() {

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {

    alert(
      "اس browser میں voice recognition available نہیں ہے۔"
    );

    return;
  }

  if (isListening && recognition) {
    recognition.stop();
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = "ur-PK";

  recognition.continuous = false;

  recognition.interimResults = false;

  recognition.onstart = function () {

    isListening = true;

    const input = getElement("userInput");

    if (input) {
      input.placeholder = "سن رہا ہوں...";
    }
  };

  recognition.onresult = function (event) {

    const transcript =
      event.results[0][0].transcript;

    const input = getElement("userInput");

    if (input) {
      input.value = transcript;
    }

    sendMessage();
  };

  recognition.onerror = function (event) {

    console.error(
      "Voice recognition error:",
      event.error
    );
  };

  recognition.onend = function () {

    isListening = false;

    const input = getElement("userInput");

    if (input) {
      input.placeholder = "Message Rafi...";
    }
  };

  recognition.start();
}


function speakReply(text) {

  if (!window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();

  const cleanText =
    String(text)
      .replace(/[*#_`]/g, "")
      .slice(0, 1500);

  const speech =
    new SpeechSynthesisUtterance(cleanText);

  speech.lang = "ur-PK";

  speech.rate = 0.95;

  speech.pitch = 1;

  const voiceSelect =
    getElement("voiceSelect");

  if (
    voiceSelect &&
    voiceSelect.value !== "default"
  ) {

    const voices =
      window.speechSynthesis.getVoices();

    const selected =
      voices.find(
        voice =>
          voice.name === voiceSelect.value
      );

    if (selected) {
      speech.voice = selected;
    }
  }

  window.speechSynthesis.speak(speech);
}


/* =========================
   CHAT CONTROLS
========================= */

function clearChat() {

  const container =
    getElement("chatMessages");

  if (!container) return;

  container.innerHTML = `
    <div class="rafi-welcome">

      <div class="welcome-avatar">R</div>

      <h2>
        Hello, I'm <span>Rafi.</span>
      </h2>

      <p>
        Your AI assistant for knowledge, business and e-commerce.
      </p>

      <div class="suggestions">

        <button
          type="button"
          onclick="setSuggestion('Help me research a profitable product')"
        >
          🔎 Product research
        </button>

        <button
          type="button"
          onclick="setSuggestion('Help me find an Alibaba supplier')"
        >
          🏭 Supplier research
        </button>

        <button
          type="button"
          onclick="setSuggestion('Calculate my product profit margin')"
        >
          💰 Calculate profit
        </button>

      </div>

    </div>
  `;
}


function setSuggestion(text) {

  const input =
    getElement("userInput");

  if (!input) return;

  input.value = text;

  input.focus();
}


function exportChat() {

  const container =
    getElement("chatMessages");

  if (!container) return;

  const text =
    container.innerText;

  const blob =
    new Blob(
      [text],
      {
        type: "text/plain;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "Rafi-AI-chat.txt";

  link.click();

  URL.revokeObjectURL(url);
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
      "productResearchResult",
      "Product name ضروری ہے۔"
    );

    return;
  }

  try {

    const response =
      await fetch("/api/productResearch", {
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
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Product research failed"
      );
    }

    showResult(
      "productResearchResult",
      `
        <strong>${escapeHtml(data.product)}</strong><br><br>
        Total cost: $${Number(data.totalCost).toFixed(2)}<br>
        Selling price: $${Number(data.sellingPrice).toFixed(2)}<br>
        Profit: $${Number(data.profit).toFixed(2)}<br>
        Profit margin: ${Number(data.profitMargin).toFixed(2)}%<br>
        Competition: ${escapeHtml(data.competition)}
      `
    );

  } catch (error) {

    showResult(
      "productResearchResult",
      "Product research مکمل نہیں ہو سکی۔"
    );

    console.error(error);
  }
}


/* =========================
   SUPPLIER RESEARCH
========================= */

async function researchSupplier() {

  const supplierName =
    getElement("supplierName")?.value.trim();

  const productName =
    getElement("supplierProductName")?.value.trim();

  const unitPrice =
    getElement("unitPrice")?.value;

  const moq =
    getElement("moq")?.value;

  const stock =
    getElement("stock")?.value.trim();

  const shippingCost =
    getElement("supplierShippingCost")?.value;

  const deliveryTime =
    getElement("deliveryTime")?.value.trim();

  if (!supplierName || !productName) {

    showResult(
      "supplierResearchResult",
      "Supplier name اور product name ضروری ہیں۔"
    );

    return;
  }

  try {

    const response =
      await fetch("/api/supplierResearch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          supplierName,
          productName,
          unitPrice,
          moq,
          stock,
          shippingCost,
          deliveryTime
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Supplier research failed"
      );
    }

    showResult(
      "supplierResearchResult",
      `
        <strong>${escapeHtml(data.supplier)}</strong><br><br>
        Product: ${escapeHtml(data.product)}<br>
        Unit price: $${Number(data.unitPrice).toFixed(2)}<br>
        Shipping: $${Number(data.shippingCost).toFixed(2)}<br>
        Estimated unit cost: $${Number(data.estimatedUnitCost).toFixed(2)}<br>
        MOQ: ${escapeHtml(data.minimumOrderQuantity)}<br>
        Stock: ${escapeHtml(data.stock)}<br>
        Delivery: ${escapeHtml(data.deliveryTime)}
      `
    );

  } catch (error) {

    showResult(
      "supplierResearchResult",
      "Supplier research مکمل نہیں ہو سکی۔"
    );

    console.error(error);
  }
}


/* =========================
   ORDER APPROVAL
========================= */

async function checkApproval() {

  const productName =
    getElement("approvalProductName")?.value.trim();

  const quantity =
    getElement("approvalQuantity")?.value;

  const unitCost =
    getElement("approvalUnitCost")?.value;

  const shippingCost =
    getElement("approvalShippingCost")?.value;

  const sellingPrice =
    getElement("approvalSellingPrice")?.value;

  if (!productName) {

    showResult(
      "approvalResult",
      "Product name ضروری ہے۔"
    );

    return;
  }

  try {

    const response =
      await fetch("/api/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          unitCost,
          shippingCost,
          sellingPrice
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Approval check failed"
      );
    }

    orderApproved = false;

    showResult(
      "approvalResult",
      `
        <strong>${escapeHtml(data.productName)}</strong><br><br>
        Quantity: ${data.quantity}<br>
        Total cost: $${Number(data.totalCost).toFixed(2)}<br>
        Total revenue: $${Number(data.totalRevenue).toFixed(2)}<br>
        Estimated profit: $${Number(data.estimatedProfit).toFixed(2)}<br><br>
        <strong>Status:</strong> Human approval required.
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      "Order calculation مکمل نہیں ہو سکی۔"
    );

    console.error(error);
  }
}


function getApprovalTotalCost() {

  const quantity =
    Number(
      getElement("approvalQuantity")?.value || 0
    );

  const unitCost =
    Number(
      getElement("approvalUnitCost")?.value || 0
    );

  const shipping =
    Number(
      getElement("approvalShippingCost")?.value || 0
    );

  return (
    quantity *
    (unitCost + shipping)
  );
}


async function approveOrder() {

  const productName =
    getElement("approvalProductName")?.value.trim();

  if (!productName) {

    showResult(
      "approvalResult",
      "پہلے order check کریں۔"
    );

    return;
  }

  try {

    const response =
      await fetch("/api/orderApproval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity:
            Number(
              getElement("approvalQuantity")?.value || 0
            ),
          totalCost:
            getApprovalTotalCost(),
          action: "approve"
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Approval failed"
      );
    }

    orderApproved = true;

    showResult(
      "approvalResult",
      `
        <strong>Order approved.</strong><br><br>
        ${escapeHtml(data.status)}
      `
    );

  } catch (error) {

    showResult(
      "approvalResult",
      "Approval مکمل نہیں ہوئی۔"
    );

    console.error(error);
  }
}


async function rejectOrder() {

  const productName =
    getElement("approvalProductName")?.value.trim();

  if (!productName) return;

  try {

    const response =
      await fetch("/api/orderApproval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity:
            Number(
              getElement("approvalQuantity")?.value || 0
            ),
          totalCost:
            getApprovalTotalCost(),
          action: "reject"
        })
      });

    const data =
      await response.json();

    orderApproved = false;

    showResult(
      "approvalResult",
      `
        <strong>Order rejected.</strong><br><br>
        ${escapeHtml(data.status || "Order rejected")}
      `
    );

  } catch (error) {

    console.error(error);

    showResult(
      "approvalResult",
      "Order reject نہیں ہو سکا۔"
    );
  }
}


/* =========================
   SUPPLIER CONVERSATION
========================= */

async function sendSupplierMessage() {

  const input =
    getElement("supplierMessage");

  if (!input) return;

  const message =
    input.value.trim();

  if (!message) return;

  try {

    const response =
      await fetch("/api/supplierConversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId:
            supplierConversationId,
          message
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Supplier conversation failed"
      );
    }

    supplierConversationId =
      data.conversationId;

    showResult(
      "supplierConversationResult",
      `
        <strong>Rafi:</strong><br>
        ${escapeHtml(data.reply)}
      `
    );

  } catch (error) {

    showResult(
      "supplierConversationResult",
      "Supplier AI سے رابطہ نہیں ہو سکا۔"
    );

    console.error(error);
  }
}


/* =========================
   SUPPLIER ORDER
========================= */

async function prepareSupplierOrder() {

  if (!orderApproved) {

    alert(
      "Supplier order سے پہلے human approval ضروری ہے۔"
    );

    return;
  }

  const productName =
    getElement("approvalProductName")?.value.trim();

  const quantity =
    Number(
      getElement("approvalQuantity")?.value || 0
    );

  try {

    const response =
      await fetch("/api/supplierOrder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          quantity,
          supplierName:
            getElement("supplierName")?.value.trim(),
          totalCost:
            getApprovalTotalCost(),
          approved: true
        })
      });

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Supplier order failed"
      );
    }

    console.log(data);

  } catch (error) {

    console.error(error);
  }
}


/* =========================
   IMAGE / LIVE TOOLS
========================= */

async function editImage() {

  const imageInput =
    getElement("imageInput");

  if (
    !imageInput ||
    !imageInput.files ||
    !imageInput.files[0]
  ) {

    alert(
      "پہلے ایک image منتخب کریں۔"
    );

    return;
  }

  alert(
    "Image منتخب ہو گئی ہے۔ Image AI connection اگلے مرحلے میں فعال کیا جائے گا۔"
  );
}


async function startLiveCall() {

  if (!navigator.mediaDevices?.getUserMedia) {

    alert(
      "اس browser میں microphone available نہیں ہے۔"
    );

    return;
  }

  try {

    await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    alert(
      "Microphone access مل گیا ہے۔ Realtime AI call connection اگلے مرحلے میں فعال کیا جائے گا۔"
    );

  } catch (error) {

    alert(
      "Microphone permission نہیں ملی۔"
    );

    console.error(error);
  }
}


/* =========================
   CONTACT
========================= */

function submitContact(event) {

  event.preventDefault();

  const name =
    getElement("contactName")?.value.trim();

  alert(
    `شکریہ ${name || "دوست"}! آپ کا message تیار ہے۔`
  );
}


/* =========================
   VOICE LIST
========================= */

function loadVoices() {

  if (!window.speechSynthesis) return;

  const select =
    getElement("voiceSelect");

  if (!select) return;

  const voices =
    window.speechSynthesis.getVoices();

  const current =
    select.value;

  select.innerHTML =
    `<option value="default">Default</option>`;

  voices.forEach(voice => {

    const option =
      document.createElement("option");

    option.value =
      voice.name;

    option.textContent =
      voice.name;

    select.appendChild(option);
  });

  if (
    [...select.options]
      .some(option => option.value === current)
  ) {
    select.value = current;
  }
}


/* =========================
   IMAGE INPUT
========================= */

function setupImageInput() {

  const input =
    getElement("imageInput");

  if (!input) return;

  input.addEventListener(
    "change",
    function () {

      if (!this.files?.length) {
        return;
      }

      const file =
        this.files[0];

      addMessage(
        "user",
        `Image selected: ${file.name}`
      );
    }
  );
}


/* =========================
   INITIALIZE
========================= */

function initializeRafiAI() {

  setupImageInput();

  loadVoices();

  if (window.speechSynthesis) {

    window.speechSynthesis.onvoiceschanged =
      loadVoices;
  }

  console.log(
    "Rafi AI initialized successfully."
  );
}


document.addEventListener(
  "DOMContentLoaded",
  initializeRafiAI
);
