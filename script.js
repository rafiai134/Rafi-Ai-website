/* ================================
   RAFI AI — MAIN JAVASCRIPT
================================ */

let supplierConversationId = null;
let selectedLanguage = "en-US";
let liveCallConnection = null;
let liveCallStream = null;
let orderApproved = false;


/* ================================
   HELPERS
================================ */

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


function showResult(id, message) {
  const element = getElement(id);

  if (element) {
    element.textContent = message;
  }
}


/* ================================
   AI CHAT
================================ */

async function sendMessage() {

  const input = getElement("userInput");
  const messages = getElement("chatMessages");

  if (!input || !messages) {
    return;
  }

  const text = input.value.trim();

  if (!text) {
    return;
  }

  const welcome = messages.querySelector(".rafi-welcome");

  if (welcome) {
    welcome.remove();
  }


  const userMessage = document.createElement("div");

  userMessage.className = "message user-message";
  userMessage.textContent = text;

  messages.appendChild(userMessage);


  input.value = "";


  const aiMessage = document.createElement("div");

  aiMessage.className = "message ai-message";

  aiMessage.innerHTML =
    '<span class="ai-thinking">' +
      '<span></span>' +
      '<span></span>' +
      '<span></span>' +
    '</span>';

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


/* ================================
   COPY BUTTON
================================ */

function addCopyButton(messageElement) {

  if (!messageElement) {
    return;
  }


  const responseText =
    messageElement.textContent;


  const button =
    document.createElement("button");

  button.type = "button";
  button.textContent = "Copy";


  button.style.marginTop = "10px";
  button.style.padding = "7px 12px";
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";


  button.addEventListener(
    "click",
    async function() {

      try {

        await navigator.clipboard.writeText(
          responseText
        );

        button.textContent =
          "Copied ✓";


        setTimeout(function() {

          button.textContent =
            "Copy";

        }, 1500);


      } catch (error) {

        alert(
          "Copy نہیں ہو سکا۔"
        );

      }

    }
  );


  messageElement.appendChild(
    document.createElement("br")
  );

  messageElement.appendChild(button);
}


/* ================================
   NAVIGATION
================================ */

function toggleMenu() {

  const menu =
    document.querySelector(".nav-links");

  if (!menu) {
    return;
  }

  menu.classList.toggle("active");
}


/* ================================
   ENTER KEY
================================ */

function handleEnter(event) {

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {

    event.preventDefault();

    sendMessage();

  }
}


/* ================================
   CONTACT
================================ */

function submitContact(event) {

  event.preventDefault();

  const name =
    getElement("name");

  if (!name) {
    return;
  }


  const userName =
    name.value.trim();


  alert(
    "Thank you " +
    userName +
    "! Your message has been received."
  );


  event.target.reset();
}


/* ================================
   CHAT WELCOME
================================ */

function restoreWelcome() {

  const messages =
    getElement("chatMessages");

  if (!messages) {
    return;
  }


  messages.innerHTML = `

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
          onclick="document.getElementById('userInput').value='Help me find a profitable product for Shopify'; document.getElementById('userInput').focus();"
        >
          💡 Find a product
        </button>

        <button
          type="button"
          onclick="document.getElementById('userInput').value='Help me with my e-commerce business'; document.getElementById('userInput').focus();"
        >
          🛒 E-commerce help
        </button>

        <button
          type="button"
          onclick="document.getElementById('userInput').value='Give me a business idea'; document.getElementById('userInput').focus();"
        >
          ✨ Business idea
        </button>

      </div>

    </div>

  `;
}


/* ================================
   CLEAR CHAT
================================ */

function clearChat() {

  localStorage.removeItem(
    "rafiChatHistory"
  );

  restoreWelcome();

}


/* ================================
   SAVE CHAT
================================ */

function saveChatHistory() {

  const messages =
    getElement("chatMessages");

  if (!messages) {
    return;
  }


  try {

    localStorage.setItem(
      "rafiChatHistory",
      messages.innerHTML
    );

  } catch (error) {

    console.warn(
      "Chat history could not be saved."
    );

  }
}


/* ================================
   LOAD CHAT
================================ */

function loadChatHistory() {

  const messages =
    getElement("chatMessages");

  if (!messages) {
    return;
  }


  try {

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

  } catch (error) {

    console.warn(
      "Chat history could not be loaded."
    );

  }
}


/* ================================
   EXPORT CHAT
================================ */

function exportChat() {

  const messages =
    getElement("chatMessages");

  if (!messages) {
    return;
  }


  const text =
    messages.innerText.trim();


  if (!text) {

    alert(
      "Chat میں ابھی کوئی message نہیں ہے۔"
    );

    return;
  }


  const blob =
    new Blob(
      [text],
      {
        type:
          "text/plain;charset=utf-8"
      }
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


/* ================================
   VOICE INPUT
================================ */

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
        getElement("userInput");


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


  try {

    recognition.start();

  } catch (error) {

    console.warn(
      "Voice recognition could not start."
    );

  }
}


/* ================================
   LIVE CALL
================================ */

async function startLiveCall() {

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      throw new Error(
        "Microphone access is not supported."
      );

    }


    const pc =
      new RTCPeerConnection();


    liveCallConnection =
      pc;


    const audio =
      document.createElement("audio");


    audio.autoplay = true;


    pc.ontrack =
      function(event) {

        if (event.streams[0]) {

          audio.srcObject =
            event.streams[0];

        }

      };


    liveCallStream =
      await navigator.mediaDevices.getUserMedia({
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

    if (liveCallStream) {

      liveCallStream
        .getTracks()
        .forEach(function(track) {

          track.stop();

        });

    }


    liveCallStream = null;
    liveCallConnection = null;


    alert(
      "Live Call Error: " +
      error.message
    );

  }
}


/* ================================
   IMAGE INPUT
================================ */

function setupImageInput() {

  const imageInput =
    getElement("imageInput");


  if (!imageInput) {
    return;
  }


  imageInput.addEventListener(
    "change",
    function() {

      const file =
        this.files[0];


      if (!file) {
        return;
      }


      alert(
        "تصویر منتخب ہوگئی۔ اب Image Edit کے لیے اپنی تبدیلی لکھیں۔"
      );

    }
  );
}


/* ================================
   IMAGE EDITING
================================ */

async function editImage() {

  const imageInput =
    getElement("imageInput");


  const input =
    getElement("userInput");


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

    } catch (error) {

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
      data.data &&
      data.data[0] &&
      data.data[0].url;


    if (!imageUrl) {

      throw new Error(
        "Edited image نہیں ملی۔"
      );

    }


    const messages =
      getElement("chatMessages");


    if (!messages) {
      return;
    }


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


/* ================================
   PRODUCT RESEARCH
================================ */

async function researchProduct() {

  const productName =
    getElement("productName")
      ?.value
      .trim();


  const supplierPrice =
    getElement("supplierPrice")
      ?.value || "0";


  const shippingCost =
    getElement("shippingCost")
      ?.value || "0";


  const sellingPrice =
    getElement("sellingPrice")
      ?.value || "0";


  const competition =
    getElement("competition")
      ?.value
      .trim();


  const result =
    getElement("researchResult");


  if (!result) {
    return;
  }


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

        <h3>
          ${escapeHtml(data.product)}
        </h3>

        <p>
          Supplier Price:
          <strong>$${escapeHtml(data.supplierPrice)}</strong>
        </p>

        <p>
          Shipping:
          <strong>$${escapeHtml(data.shippingCost)}</strong>
        </p>

        <p>
          Total Cost:
          <strong>$${escapeHtml(data.totalCost)}</strong>
        </p>

        <p>
          Selling Price:
          <strong>$${escapeHtml(data.sellingPrice)}</strong>
        </p>

        <p>
          Profit:
          <strong>$${escapeHtml(data.profit)}</strong>
        </p>

        <p>
          Profit Margin:
          <strong>${escapeHtml(data.profitMargin)}%</strong>
        </p>

        <p>
          Competition:
          <strong>${escapeHtml(data.competition)}</strong>
        </p>

      </div>

    `;


  } catch (error) {

    result.textContent =
      "Research Error: " +
      error.message;

  }
}


/* ================================
   SUPPLIER RESEARCH
================================ */

async function researchSupplier() {

  const supplierName =
    getElement("supplierName")
      ?.value
      .trim();


  const productName =
    getElement("supplierProduct")
      ?.value
      .trim();


  const unitPrice =
    getElement("unitPrice")
      ?.value || "0";


  const shippingCost =
    getElement("supplierShipping")
      ?.value || "0";


  const moq =
    getElement("moq")
      ?.value || "0";


  const stock =
    getElement("stock")
      ?.value
      .trim();


  const deliveryTime =
    getElement("deliveryTime")
      ?.value
      .trim();


  const result =
    getElement("supplierResult");


  if (!result) {
    return;
  }


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

        <h3>
          ${escapeHtml(data.supplier)}
        </h3>

        <p>
          Product:
          <strong>${escapeHtml(data.product)}</strong>
        </p>

        <p>
          Unit Price:
          <strong>$${escapeHtml(data.unitPrice)}</strong>
        </p>

        <p>
          Shipping:
          <strong>$${escapeHtml(data.shippingCost)}</strong>
        </p>

        <p>
          Estimated Unit Cost:
          <strong>$${escapeHtml(data.estimatedUnitCost)}</strong>
        </p>

        <p>
          MOQ:
          <strong>${escapeHtml(data.minimumOrderQuantity)}</strong>
        </p>

        <p>
          Stock:
          <strong>${escapeHtml(data.stock)}</strong>
        </p>

        <p>
          Delivery Time:
          <strong>${escapeHtml(data.deliveryTime)}</strong>
        </p>

      </div>

    `;


  } catch (error) {

    result.textContent =
      "Supplier Research Error: " +
      error.message;

  }
}


/* ================================
   APPROVAL TOTAL COST
================================ */

function getApprovalTotalCost() {

  const quantity =
    Number(
      getElement("approvalQuantity")
        ?.value || 0
    );


  const unitCost =
    Number(
      getElement("approvalUnitCost")
        ?.value || 0
    );


  const shipping =
    Number(
      getElement("approvalShipping")
        ?.value || 0
    );


  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitCost) ||
    !Number.isFinite(shipping)
  ) {

    return 0;
  }


  return Number(
    (
      (unitCost + shipping) *
      quantity
    ).toFixed(2)
  );
}


/* ================================
   ORDER APPROVAL CHECK
================================ */

async function checkApproval() {

  const productName =
    getElement("approvalProduct")
      ?.value
      .trim();


  const quantity =
    getElement("approvalQuantity")
      ?.value;


  const unitCost =
    getElement("approvalUnitCost")
      ?.value;


  const shippingCost =
    getElement("approvalShipping")
      ?.value;


  const sellingPrice =
    getElement("approvalSelling")
      ?.value;


  const result =
    getElement("approvalResult");


  if (!result) {
    return;
  }


  orderApproved = false;


  if (
    !productName ||
    !quantity
  ) {

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

        <h3>
          Order Review
        </h3>

        <p>
