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

const imageInput = document.getElementById("imageInput");

imageInput.addEventListener("change", function () {
  const file = this.files[0];

  if (!file) return;

  alert("تصویر منتخب ہوگئی۔");
});

async function editImage() {
  const imageInput = document.getElementById("imageInput");
  const prompt = document.getElementById("userInput").value.trim();

  if (!imageInput.files[0]) {
    alert("پہلے تصویر منتخب کریں۔");
    return;
  }

  if (!prompt) {
    alert("تصویر میں کیا تبدیلی کرنی ہے، وہ لکھیں۔");
    return;
  }

  const formData = new FormData();

  formData.append("image", imageInput.files[0]);
  formData.append("prompt", prompt);

  try {
    alert("تصویر ایڈٹ ہو رہی ہے، براہِ کرم انتظار کریں۔");

    const response = await fetch("/api/image", {
      method: "POST",
      body: formData
    });

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(responseText || "Server نے درست جواب نہیں دیا۔");
    }

    if (!response.ok) {
      throw new Error(data.error || "Image editing failed");
    }

    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("Edited image نہیں ملی۔");
    }

    const messages = document.getElementById("chatMessages");

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "Edited image";
    image.style.maxWidth = "100%";
    image.style.borderRadius = "14px";
    image.style.marginTop = "10px";

    messages.appendChild(image);
    messages.scrollTop = messages.scrollHeight;

  } catch (error) {
    alert("Image Edit Error: " + error.message);
  }
}

async function researchProduct() {
  const productName =
    document.getElementById("productName").value.trim();

  const supplierPrice =
    document.getElementById("supplierPrice").value;

  const shippingCost =
    document.getElementById("shippingCost").value;

  const sellingPrice =
    document.getElementById("sellingPrice").value;

  const competition =
    document.getElementById("competition").value.trim();

  const result =
    document.getElementById("researchResult");

  if (!productName) {
    result.textContent = "Product name لکھیں۔";
    return;
  }

  result.textContent = "Product research ہو رہی ہے...";

  try {
    const response = await fetch("/api/productResearch", {
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Product research failed"
      );
    }

    result.innerHTML = `
      <div class="research-output">
        <h3>${data.product}</h3>

        <p>
          Supplier Price:
          <strong>$${data.supplierPrice}</strong>
        </p>

        <p>
          Shipping:
          <strong>$${data.shippingCost}</strong>
        </p>

        <p>
          Total Cost:
          <strong>$${data.totalCost}</strong>
        </p>

        <p>
          Selling Price:
          <strong>$${data.sellingPrice}</strong>
        </p>

        <p>
          Profit:
          <strong>$${data.profit}</strong>
        </p>

        <p>
          Profit Margin:
          <strong>${data.profitMargin}%</strong>
        </p>

        <p>
          Competition:
          <strong>${data.competition}</strong>
        </p>
      </div>
    `;

  } catch (error) {
    result.textContent =
      "Research Error: " + error.message;
  }
      }

async function researchSupplier() {
  const supplierName =
    document.getElementById("supplierName").value.trim();

  const productName =
    document.getElementById("supplierProduct").value.trim();

  const unitPrice =
    document.getElementById("unitPrice").value;

  const shippingCost =
    document.getElementById("supplierShipping").value;

  const moq =
    document.getElementById("moq").value;

  const stock =
    document.getElementById("stock").value.trim();

  const deliveryTime =
    document.getElementById("deliveryTime").value.trim();

  const result =
    document.getElementById("supplierResult");

  if (!supplierName || !productName) {
    result.textContent =
      "Supplier Name اور Product Name لکھیں۔";
    return;
  }

  result.textContent =
    "Supplier research ہو رہی ہے...";

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
          moq,
          stock,
          shippingCost,
          deliveryTime
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Supplier research failed"
      );
    }

    result.innerHTML = `
      <div class="research-output">

        <h3>${data.supplier}</h3>

        <p>
          Product:
          <strong>${data.product}</strong>
        </p>

        <p>
          Unit Price:
          <strong>$${data.unitPrice}</strong>
        </p>

        <p>
          Shipping:
          <strong>$${data.shippingCost}</strong>
        </p>

        <p>
          Estimated Unit Cost:
          <strong>$${data.estimatedUnitCost}</strong>
        </p>

        <p>
          MOQ:
          <strong>${data.minimumOrderQuantity}</strong>
        </p>

        <p>
          Stock:
          <strong>${data.stock}</strong>
        </p>

        <p>
          Delivery Time:
          <strong>${data.deliveryTime}</strong>
        </p>

      </div>
    `;

  } catch (error) {
    result.textContent =
      "Supplier Research Error: " + error.message;
  }
}

async function checkApproval() {
  const productName = prompt("Product name:");
  const quantity = prompt("Quantity:");
  const unitCost = prompt("Supplier unit cost:");
  const shippingCost = prompt("Shipping cost per unit:");
  const sellingPrice = prompt("Selling price per unit:");

  if (!productName || !quantity) {
    return;
  }

  try {
    const response = await fetch("/api/approval", {
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Approval check failed");
    }

    alert(
      "Approval Required\n\n" +
      "Product: " + data.productName + "\n" +
      "Quantity: " + data.quantity + "\n" +
      "Total Cost: $" + data.totalCost + "\n" +
      "Revenue: $" + data.totalRevenue + "\n" +
      "Estimated Profit: $" + data.estimatedProfit + "\n\n" +
      "Status: " + data.status
    );

  } catch (error) {
    alert("Approval Error: " + error.message);
  }
        }

async function checkApproval() {
  const productName =
    document.getElementById("approvalProduct").value.trim();

  const quantity =
    document.getElementById("approvalQuantity").value;

  const unitCost =
    document.getElementById("approvalUnitCost").value;

  const shippingCost =
    document.getElementById("approvalShipping").value;

  const sellingPrice =
    document.getElementById("approvalSelling").value;

  const result =
    document.getElementById("approvalResult");

  if (!productName || !quantity) {
    result.textContent =
      "Product name اور quantity درج کریں۔";
    return;
  }

  result.textContent =
    "Order check ہو رہا ہے...";

  try {
    const response = await fetch("/api/approval", {
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Approval check failed"
      );
    }

    result.innerHTML = `
      <div class="research-output">

        <h3>Order Review</h3>

        <p>
          Product:
          <strong>${data.productName}</strong>
        </p>

        <p>
          Quantity:
          <strong>${data.quantity}</strong>
        </p>

        <p>
          Total Cost:
          <strong>$${data.totalCost}</strong>
        </p>

        <p>
          Total Revenue:
          <strong>$${data.totalRevenue}</strong>
        </p>

        <p>
          Estimated Profit:
          <strong>$${data.estimatedProfit}</strong>
        </p>

        <p>
          Status:
          <strong>${data.status}</strong>
        </p>

        <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">

          <button
            type="button"
            class="research-btn"
            onclick="approveOrder()"
          >
            Approve
          </button>

          <button
            type="button"
            class="research-btn"
            onclick="rejectOrder()"
          >
            Reject
          </button>

        </div>

        <div
          id="approvalDecision"
          style="margin-top:15px;"
        ></div>

      </div>
    `;

  } catch (error) {
    result.textContent =
      "Approval Error: " + error.message;
  }
}

function approveOrder() {
  const decision =
    document.getElementById("approvalDecision");

  if (decision) {
    decision.textContent =
      "Order approved by you. Supplier order has not been placed yet.";
  }
}

function rejectOrder() {
  const decision =
    document.getElementById("approvalDecision");

  if (decision) {
    decision.textContent =
      "Order rejected. No supplier order will be placed.";
  }
      }

async function sendSupplierMessage() {
  const message =
    document.getElementById("supplierChatMessage").value.trim();

  const result =
    document.getElementById("supplierChatResult");

  if (!message) {
    result.textContent = "Supplier کا message لکھیں۔";
    return;
  }

  result.textContent = "Conversation محفوظ ہو رہی ہے...";

  try {
    const response = await fetch(
      "/api/supplierConversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: message
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Conversation failed"
      );
    }

    result.innerHTML = `
      <div class="research-output">
        <h3>Supplier Conversation</h3>
        <p>Message محفوظ ہو گیا۔</p>
        <p>
          Conversation ID:
          <strong>${data.conversationId}</strong>
        </p>
      </div>
    `;

    document.getElementById(
      "supplierChatMessage"
    ).value = "";

  } catch (error) {
    result.textContent =
      "Supplier Conversation Error: " +
      error.message;
  }
}
