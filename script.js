/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const chatHelp = document.getElementById("chatHelp");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const generateRoutineButton = document.getElementById("generateRoutine");
const generateRoutineLabel = document.getElementById("generateRoutineLabel");
const workerUrl = "https://steep-wave-dc00.ijsando1.workers.dev/";
const selectedProductsStorageKey = "loreal-routine-builder:selected-product-ids";
const selectedProducts = new Map();
let conversationMessages = [];
let currentProducts = [];
let hasGeneratedRoutine = false;
let productsPromise = null;

/* Show an initial placeholder until the user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
  Search or choose a category to explore products
  </div>
`;

/* Load product data from the JSON file */
async function loadProducts() {
  const response = await fetch("products.json");

  if (!response.ok) {
    throw new Error(`Failed to load products: ${response.status}`);
  }

  const data = await response.json();
  return data.products;
}

/* Reuse the product data while users change categories or search terms */
async function getProducts() {
  if (!productsPromise) {
    productsPromise = loadProducts();
  }

  try {
    return await productsPromise;
  } catch (error) {
    productsPromise = null;
    throw error;
  }
}

/* Read selected product IDs saved by this browser */
function loadSavedProductIds() {
  let savedProductIds;

  try {
    const savedValue = localStorage.getItem(selectedProductsStorageKey);

    if (!savedValue) {
      return [];
    }

    savedProductIds = JSON.parse(savedValue);
  } catch (error) {
    console.error("Saved product selection couldn't be read:", error);
    return [];
  }

  if (
    !Array.isArray(savedProductIds) ||
    !savedProductIds.every(
      (productId) => Number.isSafeInteger(productId) && productId > 0
    )
  ) {
    console.error("Saved product selection is invalid.");
    return [];
  }

  return Array.from(new Set(savedProductIds));
}

/* Save only IDs so current product details always come from products.json */
function saveSelectedProductIds() {
  try {
    const productIds = Array.from(selectedProducts.keys());

    if (productIds.length === 0) {
      localStorage.removeItem(selectedProductsStorageKey);
    } else {
      localStorage.setItem(
        selectedProductsStorageKey,
        JSON.stringify(productIds)
      );
    }
  } catch (error) {
    console.error("Selected products couldn't be saved:", error);
  }
}

/* Create product cards and show which products are already selected */
function displayProducts(products) {
  currentProducts = products;

  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products match. Try a different keyword or category.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.has(product.id);
      const descriptionId = `product-description-${product.id}`;

      return `
        <button
          type="button"
          class="product-card${isSelected ? " is-selected" : ""}"
          data-product-id="${product.id}"
          aria-pressed="${isSelected}"
          aria-label="${product.name}, ${product.brand}"
          aria-describedby="${descriptionId}"
        >
          <img src="${product.image}" alt="" loading="lazy">
          <span class="product-info">
            <span class="product-name" dir="auto">${product.name}</span>
            <span class="product-brand" dir="auto">${product.brand}</span>
          </span>
          <span class="product-selection-indicator" aria-hidden="true">
            <i class="fa-solid fa-check"></i>
          </span>
          <span class="product-description-overlay" id="${descriptionId}">
            <span class="product-description-label">PRODUCT DESCRIPTION</span>
            <span class="product-description-copy" dir="auto">${product.description}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

/* Apply the category and text filters together */
async function filterProducts() {
  try {
    const products = await getProducts();
    const selectedCategory = categoryFilter.value;
    const searchTerms = productSearch.value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const filteredProducts = products.filter((product) => {
      const matchesCategory =
        selectedCategory === "" || product.category === selectedCategory;
      const searchableText =
        `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
      const matchesSearch = searchTerms.every((term) =>
        searchableText.includes(term)
      );

      return matchesCategory && matchesSearch;
    });

    displayProducts(filteredProducts);
  } catch (error) {
    currentProducts = [];
    console.error("Product filtering failed:", error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Products couldn't be loaded. Please try again.
      </div>
    `;
  }
}

/* Keep the product grid and routine list in sync with the selected products */
function updateSelection() {
  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    const isSelected = selectedProducts.has(Number(card.dataset.productId));
    card.classList.toggle("is-selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  selectedProductsList.innerHTML = Array.from(selectedProducts.values())
    .map(
      (product) => `
        <div class="selected-product-item">
          <span class="selected-product-info">
            <span class="selected-product-name" dir="auto">${product.name}</span>
            <span class="selected-product-brand" dir="auto">${product.brand}</span>
          </span>
          <button
            type="button"
            class="remove-product"
            data-product-id="${product.id}"
            aria-label="Remove ${product.name} from your routine"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      `
    )
    .join("");
}

/* Restore saved products using the current product catalog */
async function restoreSavedProducts() {
  const savedProductIds = loadSavedProductIds();

  if (savedProductIds.length === 0) {
    return;
  }

  try {
    const products = await getProducts();
    const productsById = new Map(
      products.map((product) => [product.id, product])
    );

    savedProductIds.forEach((productId) => {
      const product = productsById.get(productId);

      if (product) {
        selectedProducts.set(productId, product);
      }
    });

    if (selectedProducts.size !== savedProductIds.length) {
      saveSelectedProductIds();
    }

    updateSelection();
  } catch (error) {
    console.error("Saved product selection couldn't be restored:", error);
  }
}

/* Add messages as text so user and generated content is never treated as HTML */
function appendChatMessage(label, content, messageType) {
  const message = document.createElement("div");
  message.className = `advisor-message ${messageType}`;

  const messageLabel = document.createElement("span");
  messageLabel.textContent = label;

  const messageContent = document.createElement("p");
  messageContent.dir = "auto";
  messageContent.textContent = content;

  message.append(messageLabel, messageContent);
  chatWindow.append(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return message;
}

/* Send the full message history to the project's Cloudflare Worker */
async function requestAssistantResponse(messages) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      messages: [
        {
          role: "system",
          content: "You are a L'Oréal skincare and beauty advisor...",
        },
        { role: "user", content: "Build a routine using these products: ..." },
      ]
     }),
  });

  if (!response.ok) {
    throw new Error(`The routine service returned ${response.status}.`);
  }

  const data = await response.json();
  const answer =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (typeof answer !== "string" || answer.trim() === "") {
    throw new Error("The routine service returned an empty response.");
  }

  return answer.trim();
}

/* Prevent new requests until the current request has finished */
function setRequestState(isBusy) {
  generateRoutineButton.disabled = isBusy;
  generateRoutineButton.setAttribute("aria-busy", String(isBusy));
  userInput.disabled = isBusy || !hasGeneratedRoutine;
  sendButton.disabled = isBusy || !hasGeneratedRoutine;
}

/* Filter products when the category or search text changes */
categoryFilter.addEventListener("change", filterProducts);
productSearch.addEventListener("input", filterProducts);

/* Let users toggle products by clicking or keyboard-activating a card */
productsContainer.addEventListener("click", (event) => {
  const productCard = event.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const productId = Number(productCard.dataset.productId);
  const isSelected = selectedProducts.has(productId);

  if (isSelected) {
    selectedProducts.delete(productId);
  } else {
    const product = currentProducts.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    selectedProducts.set(productId, product);
  }

  saveSelectedProductIds();
  updateSelection();
});

/* Let users remove products directly from their routine list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-product");

  if (!removeButton) {
    return;
  }

  selectedProducts.delete(Number(removeButton.dataset.productId));
  saveSelectedProductIds();
  updateSelection();
});

/* Send only selected product details to the Worker and show its routine */
generateRoutineButton.addEventListener("click", async () => {
  const productsForRoutine = Array.from(selectedProducts.values()).map(
    ({ name, brand, category, description }) => ({
      name,
      brand,
      category,
      description,
    })
  );

  if (productsForRoutine.length === 0) {
    appendChatMessage(
      "YOUR BEAUTY ADVISOR",
      "Choose at least one product to create your personalized routine.",
      "routine-error"
    );
    return;
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a beauty advisor who can discuss only the user's generated routine and related beauty or personal-care topics, including skincare, haircare, makeup, fragrance, cosmetics, hair styling, and personal-care products. If a question is unrelated, briefly say you can help with beauty topics and invite an in-scope question. Use the full conversation for context. Create a clear routine using only the selected products in the user's JSON, organize steps in a practical order, and explain how to use each product. Do not invent products, ingredients, or benefits that are not in the supplied details, and do not give diagnoses or medical treatment advice. Remind the user to follow each product's label directions.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          request: "Create a personalized routine using these selected products.",
          selectedProducts: productsForRoutine,
        },
        null,
        2
      ),
    },
  ];

  conversationMessages = messages;
  hasGeneratedRoutine = false;
  userInput.value = "";
  userInput.placeholder = "Preparing your routine...";
  chatHelp.textContent = "Creating your personalized routine...";
  setRequestState(true);
  generateRoutineLabel.textContent = "Creating your routine...";
  chatWindow.setAttribute("aria-busy", "true");
  chatWindow.replaceChildren();
  appendChatMessage(
    "BUILDING YOUR ROUTINE",
    "Your selected products are on their way to your beauty advisor.",
    "routine-loading"
  );

  try {
    const routine = await requestAssistantResponse(conversationMessages);
    conversationMessages.push({ role: "assistant", content: routine });
    hasGeneratedRoutine = true;
    userInput.placeholder = "Ask about your routine or another beauty topic...";
    chatHelp.textContent =
      "Ask about your routine, skincare, haircare, makeup, fragrance, or related beauty topics.";
    chatWindow.replaceChildren();
    appendChatMessage(
      "YOUR PERSONALIZED ROUTINE",
      routine,
      "routine-response"
    );
  } catch (error) {
    conversationMessages = [];
    hasGeneratedRoutine = false;
    userInput.placeholder = "Generate a routine to start chatting...";
    console.error("Routine generation failed:", error);
    chatHelp.textContent = "Generate a routine to unlock follow-up questions.";
    chatWindow.replaceChildren();
    appendChatMessage(
      "ROUTINE UNAVAILABLE",
      "We couldn't create your routine right now. Please try again.",
      "routine-error"
    );
  } finally {
    setRequestState(false);
    generateRoutineLabel.textContent = "Generate my routine";
    chatWindow.setAttribute("aria-busy", "false");
  }
});

/* Send each follow-up with the complete routine and conversation history */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = userInput.value.trim();

  if (!hasGeneratedRoutine || question === "") {
    return;
  }

  const messagesForRequest = conversationMessages.concat({
    role: "user",
    content: question,
  });

  setRequestState(true);
  chatWindow.setAttribute("aria-busy", "true");
  const loadingMessage = appendChatMessage(
    "YOUR BEAUTY ADVISOR",
    "Thinking...",
    "routine-loading"
  );

  try {
    const answer = await requestAssistantResponse(messagesForRequest);
    conversationMessages = messagesForRequest.concat({
      role: "assistant",
      content: answer,
    });

    loadingMessage.remove();
    appendChatMessage("YOU", question, "user-message");
    appendChatMessage("YOUR BEAUTY ADVISOR", answer, "routine-response");
    userInput.value = "";
  } catch (error) {
    console.error("Follow-up response failed:", error);
    loadingMessage.remove();
    appendChatMessage(
      "FOLLOW-UP UNAVAILABLE",
      "I couldn't answer that just now. Please try again.",
      "routine-error"
    );
  } finally {
    setRequestState(false);
    chatWindow.setAttribute("aria-busy", "false");
  }
});

restoreSavedProducts();
