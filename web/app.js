let items = [];
let currentFilter = "todo";

let favorites = new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
let pinned = new Set(JSON.parse(localStorage.getItem("pinned") || "[]"));
let readItems = new Set(JSON.parse(localStorage.getItem("read") || "[]"));

const feed = document.getElementById("feed");
const dateElement = document.getElementById("date");

const brandButton = document.getElementById("brandButton");
const themeMenu = document.getElementById("themeMenu");

let currentTheme = document.documentElement.dataset.theme || "dark";

// URL pública del news.json generado por GitHub Actions
// IMPORTANTE: Reemplaza "TU_USUARIO" por tu usuario real de GitHub
const NEWS_URL = "./news.json";

function saveFavorites() {
  localStorage.setItem("favorites", JSON.stringify([...favorites]));
}

function savePinned() {
  localStorage.setItem("pinned", JSON.stringify([...pinned]));
}

function saveRead() {
  localStorage.setItem("read", JSON.stringify([...readItems]));
}

function applyTheme(theme) {
  if (theme !== "light" && theme !== "dark") {
    theme = "dark";
  }

  document.documentElement.dataset.theme = theme;
  currentTheme = theme;

  try {
    localStorage.setItem("kellgreat-theme", theme);
  } catch (error) {
    console.error("No se pudo guardar el tema", error);
  }

  updateThemeMenu();
}

function updateThemeMenu() {
  if (!themeMenu) {
    return;
  }

  const options = themeMenu.querySelectorAll(".theme-option");

  options.forEach(option => {
    const isActive = option.dataset.theme === currentTheme;
    option.classList.toggle("active", isActive);
  });
}

function openThemeMenu() {
  if (!themeMenu || !brandButton) {
    return;
  }

  themeMenu.classList.add("open");
  brandButton.setAttribute("aria-expanded", "true");
  updateThemeMenu();
}

function closeThemeMenu() {
  if (!themeMenu || !brandButton) {
    return;
  }

  themeMenu.classList.remove("open");
  brandButton.setAttribute("aria-expanded", "false");
}

function initTheme() {
  if (!brandButton || !themeMenu) {
    return;
  }

  brandButton.addEventListener("click", event => {
    event.stopPropagation();

    if (themeMenu.classList.contains("open")) {
      closeThemeMenu();
    } else {
      openThemeMenu();
    }
  });

  themeMenu.addEventListener("click", event => {
    event.stopPropagation();
  });

  document.addEventListener("click", event => {
    if (!themeMenu.contains(event.target) && !brandButton.contains(event.target)) {
      closeThemeMenu();
    }
  });

  const themeOptions = themeMenu.querySelectorAll(".theme-option");

  themeOptions.forEach(option => {
    option.addEventListener("click", () => {
      applyTheme(option.dataset.theme);
      closeThemeMenu();
    });
  });

  updateThemeMenu();
}

function setHeaderDate() {
  const now = new Date();

  dateElement.textContent = now.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long"
  });
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tabs button");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;

      buttons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      render();
    });
  });
}

async function loadNews() {
  try {
    const response = await fetch(NEWS_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No se pudo leer news.json");
    }

    const data = await response.json();
    items = data.items || [];

    render();
  } catch (error) {
    feed.innerHTML = `
      <div class="empty">
        Error cargando noticias.
      </div>
    `;
    console.error(error);
  }
}

function getTime(value) {
  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return 0;
  }

  return date.getTime();
}

function sortItems(list) {
  return [...list].sort((a, b) => {
    const pinnedA = pinned.has(a.id);
    const pinnedB = pinned.has(b.id);

    if (pinnedA !== pinnedB) {
      return pinnedA ? -1 : 1;
    }

    return getTime(b.fecha) - getTime(a.fecha);
  });
}

function getFilteredItems() {
  let filtered = [];

  if (currentFilter === "todo") {
    filtered = items;
  }

  if (currentFilter === "anclados") {
    filtered = items.filter(item => pinned.has(item.id));
  }

  if (currentFilter === "youtube") {
    filtered = items.filter(item => item.tipo === "youtube");
  }

  if (currentFilter === "web") {
    filtered = items.filter(item => item.tipo === "web");
  }

  if (currentFilter === "favoritos") {
    filtered = items.filter(item => favorites.has(item.id));
  }

  return sortItems(filtered);
}

function formatDate(dateString) {
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short"
  });
}

function getTypeInfo(item) {
  if (item.tipo === "youtube") {
    return {
      label: "YouTube",
      className: "youtube"
    };
  }

  return {
    label: "Web",
    className: "web"
  };
}

function escapeHtml(value) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };

  return String(value || "").replace(/[&<>"']/g, char => map[char]);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      return true;
    } catch (fallbackError) {
      return false;
    }
  }
}

function markAsRead(item, card) {
  if (!readItems.has(item.id)) {
    readItems.add(item.id);
    saveRead();
    card.classList.add("read");
  }
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  if (readItems.has(item.id)) {
    card.classList.add("read");
  }

  const type = getTypeInfo(item);
  const isFavorite = favorites.has(item.id);
  const isPinned = pinned.has(item.id);

  const safeTitle = escapeHtml(item.titulo);
  const safeSource = escapeHtml(item.fuente_nombre);
  const safeShort = escapeHtml(item.resumen_corto);
  const safeLong = escapeHtml(item.resumen_largo);

  card.innerHTML = `
    <div class="card-meta">
      <span class="badge ${type.className}">${type.label}</span>
      <span class="source-name">${safeSource}</span>
      <span class="date">${formatDate(item.fecha)}</span>
    </div>

    <h2>${safeTitle}</h2>

    <p class="short">${safeShort}</p>

    <div class="long hidden">
      ${safeLong}
    </div>

    <div class="actions">
      <button class="btn primary read">Leer resumen</button>
      <a class="btn ghost original" href="#" target="_blank" rel="noopener">Original</a>
      <button class="btn ghost copy">Copiar</button>
      <button class="btn pin ${isPinned ? "active" : ""}">
        ${isPinned ? "📌 Anclado" : "📌 Anclar"}
      </button>
      <button class="btn fav ${isFavorite ? "active" : ""}">
        ${isFavorite ? "★ Guardado" : "☆ Favorito"}
      </button>
    </div>
  `;

  const originalLink = card.querySelector(".original");
  originalLink.href = item.enlace || "#";

  const readButton = card.querySelector(".read");
  const longText = card.querySelector(".long");

  readButton.addEventListener("click", () => {
    const isHidden = longText.classList.toggle("hidden");

    if (isHidden) {
      readButton.textContent = "Leer resumen";
    } else {
      readButton.textContent = "Ocultar resumen";
      markAsRead(item, card);
    }
  });

  const copyButton = card.querySelector(".copy");

  copyButton.addEventListener("click", async () => {
    const text = [
      item.titulo,
      "",
      item.resumen_corto,
      "",
      item.resumen_largo,
      "",
      `Fuente: ${item.fuente_nombre}`,
      `Enlace: ${item.enlace}`
    ].join("\n");

    const ok = await copyText(text);

    copyButton.textContent = ok ? "Copiado" : "Error";

    copyButton.classList.remove("copied", "error");
    copyButton.classList.add(ok ? "copied" : "error");

    setTimeout(() => {
      copyButton.textContent = "Copiar";
      copyButton.classList.remove("copied", "error");
    }, 1200);
  });

  const pinButton = card.querySelector(".pin");

  pinButton.addEventListener("click", () => {
    if (pinned.has(item.id)) {
      pinned.delete(item.id);
      pinButton.classList.remove("active");
      pinButton.textContent = "📌 Anclar";
    } else {
      pinned.add(item.id);
      pinButton.classList.add("active");
      pinButton.textContent = "📌 Anclado";
    }

    savePinned();

    if (currentFilter === "anclados") {
      render();
    }
  });

  const favButton = card.querySelector(".fav");

  favButton.addEventListener("click", () => {
    if (favorites.has(item.id)) {
      favorites.delete(item.id);
      favButton.classList.remove("active");
      favButton.textContent = "☆ Favorito";
    } else {
      favorites.add(item.id);
      favButton.classList.add("active");
      favButton.textContent = "★ Guardado";
    }

    saveFavorites();

    if (currentFilter === "favoritos") {
      render();
    }
  });

  return card;
}

function render() {
  feed.innerHTML = "";

  const filteredItems = getFilteredItems();

  if (filteredItems.length === 0) {
    feed.innerHTML = `
      <div class="empty">
        No hay noticias para mostrar.
      </div>
    `;
    return;
  }

  filteredItems.forEach(item => {
    const card = createCard(item);
    feed.appendChild(card);
  });
}

function init() {
  initTheme();
  setHeaderDate();
  setupTabs();
  loadNews();
}

init();
