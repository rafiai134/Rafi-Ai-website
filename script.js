let supplierConversationId = null;
let selectedLanguage = "en-US";
let liveCallConnection = null;
let liveCallStream = null;
let orderApproved = false;


/* =========================
   AI CHAT
========================= */

async function sendMessage() {

  const input = document.getElementById("userInput");
  const messages = document.getElementById("chatMessages");

  if (!input || !messages) return;

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

      body: JSON.stringify({
        message: text
      })

    });

    const data = await response.json();

    if (!response.ok) {

      throw new Error(
        data.error || "Request failed"
      );

    }

    aiMessage.textContent =
      data.reply || "No response.";

    addCopyButton(aiMessage);

    saveChatHistory();

  } catch (error) {

    aiMessage.textContent =
      "Error: " + error.message;

  }

  messages.scrollTop =
    messages.scrollHeight;
}


/* =========================
   COPY BUTTON
========================= */

function addCopyButton(messageElement) {

  const button =
    document.createElement("button");

  button.textContent = "Copy";

  button.style.marginTop = "10px";
  button.style.padding = "7px 12px";
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";

  button.onclick = async function () {

    const text =
      messageElement.firstChild
        ? messageElement.firstChild.textContent
        : messageElement.textContent;

    try {

      await navigator.clipboard.writeText(text);

      button.textContent = "Copied ✓";

      setTimeout(function () {

        button.textContent = "Copy";

      }, 1500);

    } catch {

      alert("Copy نہیں ہو سکا۔");

    }

  };

  messageElement.appendChild(
    document.createElement("br")
  );

  messageElement.appendChild(button);
}


/* =========================
   NAVIGATION
========================= */

function toggleMenu() {

  const menu =
    document.querySelector(".nav-links");

  if (!menu) return;

  menu.classList.toggle("active");
}


/* =========================
   ENTER KEY
========================= */

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
   CONTACT
========================= */

function submitContact(event) {

  event.preventDefault();

  const name =
    document.getElementById("name");

  if (!name) return;

  alert(
    "Thank you " +
    name.value +
    "! Your message has been received."
  );

  event.target.reset();
}


/* =========================
   CLEAR CHAT
========================= */

function clearChat() {

  const messages =
    document.getElementById("chatMessages");

  if (!messages) return;

  messages.innerHTML = "";

  localStorage.removeItem(
    "rafiChatHistory"
  );

}


/* =========================
   SAVE CHAT
========================= */

function saveChatHistory() {

  const messages =
    document.getElementById("chatMessages");

  if (!messages) return;

  localStorage.setItem(
    "rafiChatHistory",
    messages.innerHTML
  );

}


/* =========================
   LOAD CHAT
========================= */

function loadChatHistory() {

  const messages =
    document.getElementById("chatMessages");

  if (!messages) return;

  const savedChat =
    localStorage.getItem(
      "rafiChatHistory"
    );

  if (savedChat) {

    messages.innerHTML =
      savedChat;

    messages.scrollTop =
      messages.scrollHeight;

  }

}


/* =========================
   EXPORT CHAT
========================= */

function exportChat() {

  const messages =
    document.getElementById("chatMessages");

  if (!messages) return;

  const text =
    messages.innerText.trim();

  if (!text) {

    alert("Chat میں ابھی کوئی message نہیں ہے۔");

    return;

  }

  const blob =
    new Blob(
      [text],
      { type: "text/plain;charset=utf-8" }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "Rafi-AI-Chat.txt";

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}


/* =========================
   VOICE INPUT
========================= */

function startVoice() {

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {

    alert(
      "Voice input is not supported in this browser."
    );

    return;

  }

  const recognition =
    new SpeechRecognition();

  recognition.lang =
    selectedLanguage;

  recognition.interimResults =
    false;

  recognition.maxAlternatives =
    1;

  recognition.onresult =
    function(event) {

      const text =
        event.results[0][0].transcript;

      const input =
        document.getElementById("userInput");

      if (input) {

        input.value = text;

        input.focus();

      }

    };

  recognition.onerror =
    function(event) {

      alert(
        "Voice error: " +
        event.error
      );

    };

  recognition.start();
}


/* =========================
   LANGUAGE SUPPORT
========================= */

document
  .querySelectorAll(
    ".language-selector button"
  )
  .forEach(function(button) {

    button.addEventListener(
      "click",
      function() {

        const language =
          this.textContent.trim();

        if (language === "English") {

          selectedLanguage =
            "en-US";

        } else if (language === "اردو") {

          selectedLanguage =
            "ur-PK";

        } else if (
          language === "हिन्दी"
        ) {

          selectedLanguage =
            "hi-IN";

        }

        document
          .querySelectorAll(
            ".language-selector button"
          )
          .forEach(function(btn) {

            btn.classList.remove(
              "active-language"
            );

          });

        this.classList.add(
          "active-language"
        );

      }
    );

  });


/* =========================
   LIVE CALL
========================= */

async function startLiveCall() {

  try {

    const pc =
      new RTCPeerConnection();

    const voiceElement =
      document.getElementById(
        "liveVoice"
      );

    const selectedVoice =
      voiceElement
        ? voiceElement.value
        : "marin";

    liveCallConnection =
      pc;

    const audio =
      document.createElement("audio");

    audio.autoplay = true;

    pc.ontrack =
      function(event) {

        audio.srcObject =
          event.streams[0];

      };

    liveCallStream =
      await navigator
        .mediaDevices
        .getUserMedia({
          audio: true
        });

    liveCallStream
      .getTracks()
      .forEach(function(track) {

        pc.addTrack(
          track,
          liveCallStream
        );

      });

    pc.createDataChannel(
      "oai-events"
    );

    const offer =
      await pc.createOffer();

    await pc.setLocalDescription(
      offer
    );

    const response =
      await fetch(
        "/api/realtime",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/sdp"
          },

          body: offer.sdp
        }
      );

    if (!response.ok) {

      const errorText =
        await response.text();

      throw new Error(
        errorText ||
        "Live Call شروع نہیں ہو سکی"
      );

    }

    const answer =
      await response.text();

    await pc.setRemoteDescription({

      type: "answer",

      sdp: answer

    });

    alert(
      "Live Call شروع ہوگئی۔ آپ بول سکتے ہیں۔"
    );

  } catch (error) {

    alert(
      "Live Call Error: " +
      error.message
    );

  }

}


/* =========================
   IMAGE INPUT
========================= */

const imageInput =
  document.getElementById(
    "imageInput"
  );

if (imageInput) {

  imageInput.addEventListener(
    "change",
    function() {

      const file =
        this.files[0];

      if (!file) return;

      alert(
        "تصویر منتخب ہوگئی۔"
      );

    }
  );

}


/* =========================
   IMAGE EDITING
========================= */

async function editImage() {

  const imageInput =
    document.getElementById(
      "imageInput"
    );

  const input =
    document.getElementById(
      "userInput"
    );

  if (
    !imageInput ||
    !imageInput.files[0]
  ) {

    alert(
      "پہلے تصویر منتخب کریں۔"
    );

    return;

  }

  const prompt =
    input
      ? input.value.trim()
      : "";

  if (!prompt) {

    alert(
      "تصویر میں کیا تبدیلی کرنی ہے، وہ لکھیں۔"
    );

    return;

  }

  const formData =
    new FormData();

  formData.append(
    "image",
    imageInput.files[0]
  );

  formData.append(
    "prompt",
    prompt
  );

  try {

    alert(
      "تصویر ایڈٹ ہو رہی ہے، براہِ کرم انتظار کریں۔"
    );

    const response =
      await fetch(
        "/api/image",
        {
          method: "POST",
          body: formData
        }
      );

    const responseText =
      await response.text();

    let data;

    try {

      data =
        JSON.parse(
          responseText
        );

    } catch {

      throw new Error(
        responseText ||
        "Server نے درست جواب نہیں دیا۔"
      );

    }

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Image editing failed"
      );

    }

    const imageUrl =
      data.data?.[0]?.url;

    if (!imageUrl) {

      throw new Error(
        "Edited image نہیں ملی۔"
      );

    }

    const messages =
      document.getElementById(
        "chatMessages"
      );

    if (!messages) return;

    const image =
      document.createElement("img");

    image.src =
      imageUrl;

    image.alt =
      "Edited image";

    image.style.maxWidth =
      "100%";

    image.style.borderRadius =
      "14px";

    image.style.marginTop =
      "10px";

    messages.appendChild(
      image
    );

    messages.scrollTop =
      messages.scrollHeight;

  } catch (error) {

    alert(
      "Image Edit Error: " +
      error.message
    );

  }

}


/* =========================
   PRODUCT RESEARCH
========================= */

async function researchProduct() {

  const productName =
    document
      .getElementById("productName")
      .value
      .trim();

  const supplierPrice =
    document
      .getElementById("supplierPrice")
      .value;

  const shippingCost =
    document
      .getElementById("shippingCost")
      .value;

  const sellingPrice =
    document
      .getElementById("sellingPrice")
      .value;

  const competition =
    document
      .getElementById("competition")
      .value
      .trim();

  const result =
    document.getElementById(
      "researchResult"
    );

  if (!productName) {

    result.textContent =
      "Product name لکھیں۔";

    return;

  }

  result.textContent =
    "Product research ہو رہی ہے...";

  try {

    const response =
      await fetch(
        "/api/productResearch",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
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

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Product research failed"
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
      "Research Error: " +
      error.message;

  }

}


/* =========================
   SUPPLIER RESEARCH
========================= */

async function researchSupplier() {

  const supplierName =
    document
      .getElementById("supplierName")
      .value
      .trim();

  const productName =
    document
      .getElementById("supplierProduct")
      .value
      .trim();

  const unitPrice =
    document
      .getElementById("unitPrice")
      .value;

  const shippingCost =
    document
      .getElementById("supplierShipping")
      .value;

  const moq =
    document
      .getElementById("moq")
      .value;

  const stock =
    document
      .getElementById("stock")
      .value
      .trim();

  const deliveryTime =
    document
      .getElementById("deliveryTime")
      .value
      .trim();

  const result =
    document.getElementById(
      "supplierResult"
    );

  if (
    !supplierName ||
    !productName
  ) {

    result.textContent =
      "Supplier Name اور Product Name لکھیں۔";

    return;

  }

  result.textContent =
    "Supplier research ہو رہی ہے...";

  try {

    const response =
      await fetch(
        "/api/supplierResearch",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
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

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Supplier research failed"
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
      "Supplier Research Error: " +
      error.message;

  }

}


/* =========================
   ORDER APPROVAL CHECK
========================= */

async function checkApproval() {

  const productName =
    document
      .getElementById("approvalProduct")
      .value
      .trim();

  const quantity =
    document
      .getElementById("approvalQuantity")
      .value;

  const unitCost =
    document
      .getElementById("approvalUnitCost")
      .value;

  const shippingCost =
    document
      .getElementById("approvalShipping")
      .value;

  const sellingPrice =
    document
      .getElementById("approvalSelling")
      .value;

  const result =
    document.getElementById(
      "approvalResult"
    );

  orderApproved = false;

  if (!productName || !quantity) {

    result.textContent =
      "Product name اور quantity درج کریں۔";

    return;

  }

  result.textContent =
    "Order check ہو رہا ہے...";

  try {

    const response =
      await fetch(
        "/api/approval",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            productName,
            quantity,
            unitCost,
            shippingCost,
            sellingPrice

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Approval check failed"
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

      </div>

    `;

  } catch (error) {

    result.textContent =
      "Approval Error: " +
      error.message;

  }

}


/* =========================
   PREPARE ORDER
========================= */

async function prepareOrder() {

  const productName =
    document
      .getElementById("approvalProduct")
      .value
      .trim();

  const quantity =
    document
      .getElementById("approvalQuantity")
      .value;

  const supplierPrice =
    document
      .getElementById("approvalUnitCost")
      .value;

  const shippingCost =
    document
      .getElementById("approvalShipping")
      .value;

  const sellingPrice =
    document
      .getElementById("approvalSelling")
      .value;

  const result =
    document.getElementById(
      "approvalResult"
    );

  orderApproved = false;

  if (!productName) {

    result.textContent =
      "Product name لکھیں۔";

    return;

  }

  result.textContent =
    "Order تیار ہو رہا ہے...";

  try {

    const response =
      await fetch(
        "/api/order",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            productName,
            quantity,
            supplierPrice,
            shippingCost,
            sellingPrice,

            stock:
              "Available",

            deliveryTime:
              "Not confirmed"

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Order preparation failed"
      );

    }

    result.innerHTML = `

      <div class="research-output">

        <h3>
          Order Ready for Approval
        </h3>

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

      </div>

    `;

  } catch (error) {

    result.textContent =
      "Order Error: " +
      error.message;

  }

}


/* =========================
   APPROVE ORDER
========================= */

async function approveOrder() {

  const productName =
    document
      .getElementById("approvalProduct")
      .value
      .trim();

  const quantity =
    document
      .getElementById("approvalQuantity")
      .value;

  const result =
    document.getElementById(
      "approvalResult"
    );

  if (!productName || !quantity) {

    result.textContent =
      "پہلے Product Name اور Quantity درج کریں۔";

    return;

  }

  try {

    const response =
      await fetch(
        "/api/orderApproval",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            productName,
            quantity,

            totalCost:
              getApprovalTotalCost(),

            action:
              "approve"

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Approval failed"
      );

    }

    orderApproved = true;

    result.innerHTML += `

      <p>
        <strong>
          ${data.status}
        </strong>
      </p>

    `;

  } catch (error) {

    result.textContent =
      "Approval Error: " +
      error.message;

  }

}


/* =========================
   REJECT ORDER
========================= */

async function rejectOrder() {

  const productName =
    document
      .getElementById("approvalProduct")
      .value
      .trim();

  const quantity =
    document
      .getElementById("approvalQuantity")
      .value;

  const result =
    document.getElementById(
      "approvalResult"
    );

  orderApproved = false;

  if (!productName) {

    result.textContent =
      "Product name لکھیں۔";

    return;

  }

  try {

    const response =
      await fetch(
        "/api/orderApproval",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            productName,
            quantity,

            totalCost:
              getApprovalTotalCost(),

            action:
              "reject"

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Rejection failed"
      );

    }

    result.innerHTML += `

      <p>
        <strong>
          ${data.status}
        </strong>
      </p>

    `;

  } catch (error) {

    result.textContent =
      "Rejection Error: " +
      error.message;

  }

}


/* =========================
   GET APPROVAL TOTAL COST
========================= */

function getApprovalTotalCost() {

  const unitCost =
    Number(
      document
        .getElementById("approvalUnitCost")
        .value || 0
    );

  const shipping =
    Number(
      document
        .getElementById("approvalShipping")
        .value || 0
    );

  const quantity =
    Number(
      document
        .getElementById("approvalQuantity")
        .value || 0
    );

  return (
    (unitCost + shipping) *
    quantity
  ).toFixed(2);

}


/* =========================
   PREPARE SUPPLIER ORDER
========================= */

async function prepareSupplierOrder() {

  const productName =
    document
      .getElementById("approvalProduct")
      .value
      .trim();

  const quantity =
    document
      .getElementById("approvalQuantity")
      .value;

  const supplierName =
    document
      .getElementById(
        "approvalSupplierName"
      )
      .value
      .trim();

  const totalCost =
    getApprovalTotalCost();

  const result =
    document.getElementById(
      "approvalResult"
    );

  if (!productName || !supplierName) {

    result.textContent =
      "Product name اور Supplier name ضروری ہیں۔";

    return;

  }

  if (!orderApproved) {

    result.textContent =
      "پہلے Order کو Approve کریں، پھر Supplier Order تیار کریں۔";

    return;

  }

  try {

    const response =
      await fetch(
        "/api/supplierOrder",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            productName,
            quantity,
            supplierName,
            totalCost,

            approved:
              true

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Supplier order preparation failed"
      );

    }

    result.innerHTML += `

      <p>
        Supplier:
        <strong>
          ${data.supplierName}
        </strong>
      </p>

      <p>
        Status:
        <strong>
          ${data.status}
        </strong>
      </p>

    `;

  } catch (error) {

    result.textContent =
      "Supplier Order Error: " +
      error.message;

  }

}


/* =========================
   SUPPLIER CONVERSATION
========================= */

async function sendSupplierMessage() {

  const input =
    document.getElementById(
      "supplierChatMessage"
    );

  const result =
    document.getElementById(
      "supplierChatResult"
    );

  if (!input || !result) return;

  const message =
    input.value.trim();

  if (!message) {

    result.textContent =
      "Supplier کا message لکھیں۔";

    return;

  }

  result.textContent =
    "Rafi AI جواب تیار کر رہا ہے...";

  try {

    const response =
      await fetch(
        "/api/supplierConversation",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            conversationId:
              supplierConversationId,

            message

          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      throw new Error(
        data.error ||
        "Conversation failed"
      );

    }

    supplierConversationId =
      data.conversationId;

    let conversationHTML = `

      <div class="research-output">

        <h3>
          Supplier Conversation
        </h3>

    `;

    if (
      data.messages &&
      data.messages.length
    ) {

      data.messages.forEach(
        function(item) {

          const title =
            item.role === "user"
              ? "آپ"
              : "Rafi AI";

          conversationHTML += `

            <p>
              <strong>
                ${title}:
              </strong>

              ${escapeHTML(
                item.content
              )}

            </p>

          `;

        }
      );

    }

    conversationHTML += `

        <p>
          Conversation ID:
          <strong>
            ${data.conversationId}
          </strong>
        </p>

      </div>

    `;

    result.innerHTML =
      conversationHTML;

    input.value = "";

  } catch (error) {

    result.textContent =
      "Supplier Conversation Error: " +
      error.message;

  }

}


/* =========================
   BASIC HTML ESCAPE
========================= */

function escapeHTML(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value ?? "";

  return div.innerHTML;
}


/* =========================
   STARTUP
========================= */

document.addEventListener(
  "DOMContentLoaded",
  function() {

    loadChatHistory();

    const messages =
      document.getElementById(
        "chatMessages"
      );

    if (messages) {

      messages.scrollTop =
        messages.scrollHeight;

    }

  }
);
