import "./styles.css";
import recipeData from "../recetas.json";
import recipeImages from "./recipe-images.json";
import { evidenceEn, recipesEn, ui } from "./i18n.js";

const state = {
  language: getSavedLanguage(),
  filter: "todos",
  query: "",
  activeRecipeId: null
};

const elements = {
  grid: document.querySelector("#recipe-grid"),
  count: document.querySelector("#recipe-count"),
  search: document.querySelector("#recipe-search"),
  recipeDialog: document.querySelector("#recipe-dialog"),
  recipeDialogContent: document.querySelector("#recipe-dialog-content"),
  sourcesDialog: document.querySelector("#sources-dialog"),
  sourceList: document.querySelector("#source-list"),
  toast: document.querySelector("#toast")
};

const recipes = recipeData.recipes;
const evidence = recipeData.evidence;
let toastTimer;

function getSavedLanguage() {
  try {
    return localStorage.getItem("sabores-language") === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

function t(key) {
  return ui[state.language][key] ?? ui.es[key] ?? key;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase(state.language === "en" ? "en" : "es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function localizeQuantity(quantity) {
  if (state.language === "es") return quantity;

  const replacements = [
    [/cantidad necesaria/gi, "as needed"],
    [/al gusto/gi, "to taste"],
    [/aprox\./gi, "approx."],
    [/opcional/gi, "optional"],
    [/dientes/gi, "cloves"],
    [/hojas/gi, "leaves"],
    [/tallos/gi, "stalks"],
    [/puñados/gi, "handfuls"],
    [/puñado/gi, "handful"],
    [/cdtas/gi, "tsp"],
    [/cdta/gi, "tsp"],
    [/cdas/gi, "tbsp"],
    [/cda/gi, "tbsp"],
    [/tazas/gi, "cups"],
    [/taza/gi, "cup"],
    [/rebanadas/gi, "slices"],
    [/lata/gi, "can"],
    [/pizca/gi, "pinch"]
  ];

  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), quantity);
}

function localizeRecipe(recipe) {
  if (state.language === "es") {
    return {
      ...recipe,
      subtitle: recipe.spanish
    };
  }

  const translation = recipesEn[recipe.id];
  return {
    ...recipe,
    subtitle: translation.subtitle,
    level: translation.level,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      ...ingredient,
      qty: localizeQuantity(ingredient.qty),
      name: translation.ingredients[index][0],
      note: translation.ingredients[index][1]
    })),
    steps: translation.steps,
    tip: translation.tip,
    season: translation.season,
    substitutions: translation.substitutions,
    health: translation.health
  };
}

function localizeEvidence(key) {
  const source = evidence[key];
  if (state.language === "es" || !evidenceEn[key]) return source;
  return { ...source, title: evidenceEn[key][0], kind: evidenceEn[key][1] };
}

function recipeKind(recipe) {
  return recipe.category === "comida" ? t("kindDish") : t("kindDessert");
}

function recipeCountLabel(count) {
  const label = count === 1 ? t("recipeSingular") : t("recipePlural");
  return `${count} ${label}`;
}

function renderTranslations() {
  document.documentElement.lang = state.language;
  document.title = t("metaTitle");
  document.querySelector('meta[name="description"]').setAttribute("content", t("metaDescription"));

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  document.querySelectorAll(".brand[href='#top']").forEach((element) => {
    element.setAttribute("aria-label", t("brandAria"));
  });
  document.querySelector(".language-switcher").setAttribute("aria-label", t("languageAria"));
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === state.language));
  });
  document.querySelectorAll("[data-close-sources]").forEach((button) => button.setAttribute("aria-label", t("close")));
}

function renderRecipes() {
  const query = normalize(state.query);
  const filtered = recipes.filter((recipe) => {
    const localized = localizeRecipe(recipe);
    const matchesFilter = state.filter === "todos"
      || recipe.category === state.filter
      || (state.filter === "facil" && localized.level === (state.language === "es" ? "Fácil" : "Easy"))
      || (state.filter === "temporada" && Boolean(recipe.season));
    const searchText = normalize([
      recipe.name,
      localized.subtitle,
      ...localized.ingredients.map((ingredient) => ingredient.name)
    ].join(" "));
    return matchesFilter && (!query || searchText.includes(query));
  });

  elements.count.textContent = recipeCountLabel(filtered.length);
  elements.grid.setAttribute("aria-busy", "false");

  if (!filtered.length) {
    elements.grid.innerHTML = `<div class="empty-state"><span aria-hidden="true">🌿</span><strong>${escapeHtml(t("emptyTitle"))}</strong><p>${escapeHtml(t("emptyBody"))}</p></div>`;
    return;
  }

  elements.grid.innerHTML = filtered.map((recipe, index) => {
    const localized = localizeRecipe(recipe);
    const image = recipeImages[recipe.id];
    return `
      <button
        class="recipe-card"
        type="button"
        data-recipe-id="${escapeHtml(recipe.id)}"
        aria-label="${escapeHtml(`${t("viewRecipe")} ${recipe.name}`)}"
        style="animation-delay:${Math.min(index * 45, 360)}ms"
      >
        <span class="card-visual">
          <img
            class="card-photo"
            src="${escapeHtml(image.src)}"
            alt="${escapeHtml(image.alt[state.language])}"
            width="${image.width}"
            height="${image.height}"
            ${index < 3 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
            decoding="async"
          />
          ${recipe.season ? `<span class="season-badge">${escapeHtml(t("seasonal"))}</span>` : ""}
        </span>
        <span class="card-body">
          <span class="card-kind">${escapeHtml(recipeKind(recipe))}</span>
          <h3>${escapeHtml(recipe.name)}</h3>
          <span class="card-subtitle">${escapeHtml(localized.subtitle)}</span>
          <span class="card-meta">
            <span>${recipe.minutes} min</span><i aria-hidden="true"></i>
            <span>${recipe.serves} ${escapeHtml(t("serves"))}</span><i aria-hidden="true"></i>
            <span>${escapeHtml(localized.level)}</span>
            <span class="card-open" aria-hidden="true">＋</span>
          </span>
        </span>
      </button>
    `;
  }).join("");
}

function ingredientTag(ingredient) {
  if (ingredient.grade === "especial") return `<span class="ingredient-tag special">${escapeHtml(t("specialty"))}</span>`;
  if (ingredient.grade === "temporada") return `<span class="ingredient-tag seasonal">${escapeHtml(t("seasonal"))}</span>`;
  return "";
}

function getEvidenceKeys(recipe) {
  return [...new Set(recipe.ingredients.flatMap((ingredient) => ingredient.evidence ?? []))];
}

function savedChecklistKey(id) {
  return `sabores-checklist-${id}`;
}

function readChecklist(id) {
  try {
    const parsed = JSON.parse(localStorage.getItem(savedChecklistKey(id)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChecklist(id) {
  const checked = [...elements.recipeDialogContent.querySelectorAll("[data-ingredient-index]:checked")]
    .map((checkbox) => Number(checkbox.dataset.ingredientIndex));
  try {
    localStorage.setItem(savedChecklistKey(id), JSON.stringify(checked));
  } catch {}
}

function renderRecipeDialog(recipeId) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return false;

  const localized = localizeRecipe(recipe);
  const image = recipeImages[recipe.id];
  const checkedIngredients = readChecklist(recipe.id);
  const evidenceKeys = getEvidenceKeys(recipe);
  const ingredientItems = localized.ingredients.map((ingredient, index) => `
    <li>
      <label>
        <input type="checkbox" data-ingredient-index="${index}" ${checkedIngredients.includes(index) ? "checked" : ""} />
        <span><strong>${escapeHtml(ingredient.qty)}</strong> ${escapeHtml(ingredient.name)} ${ingredientTag(ingredient)}</span>
      </label>
      ${ingredient.note ? `<p class="ingredient-note">${escapeHtml(ingredient.note)}</p>` : ""}
    </li>
  `).join("");
  const stepItems = localized.steps.map((step, index) => `<div class="recipe-step"><span class="step-number">${index + 1}</span><p>${escapeHtml(step)}</p></div>`).join("");
  const proofItems = evidenceKeys.map((key) => {
    const source = localizeEvidence(key);
    return `<a class="proof-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(source.provider)} · ${escapeHtml(source.kind)}</small></a>`;
  }).join("");

  elements.recipeDialogContent.innerHTML = `
    <header class="dialog-hero">
      <button class="icon-button dialog-close" type="button" data-close-recipe aria-label="${escapeHtml(t("close"))}"><span aria-hidden="true">×</span></button>
      <img class="dialog-photo" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt[state.language])}" width="${image.width}" height="${image.height}" />
      <div class="dialog-title">
        <span class="section-kicker">${escapeHtml(recipeKind(recipe))}</span>
        <h2 id="dialog-title">${escapeHtml(recipe.name)}</h2>
        <p>${escapeHtml(localized.subtitle)}</p>
        <div class="dialog-chips"><span>${recipe.minutes} min</span><span>${recipe.serves} ${escapeHtml(t("serves"))}</span><span>${escapeHtml(localized.level)}</span>${recipe.season ? `<span>🥭 ${escapeHtml(t("seasonal"))}</span>` : ""}</div>
      </div>
    </header>
    <div class="dialog-grid">
      <section class="modal-section">
        <h3>${escapeHtml(t("ingredientsTitle"))}</h3>
        <p class="modal-helper">${escapeHtml(t("ingredientsHelper"))}</p>
        <ul class="ingredient-list">${ingredientItems}</ul>
      </section>
      <section class="modal-section">
        <h3>${escapeHtml(t("preparationTitle"))}</h3>
        <p class="modal-helper">${escapeHtml(localized.season || localized.subtitle)}</p>
        ${stepItems}
        ${localized.tip ? `<div class="tip-box"><strong>${escapeHtml(t("tipTitle"))}:</strong> ${escapeHtml(localized.tip)}</div>` : ""}
        ${localized.substitutions.length ? `<div class="substitution-box"><strong>${escapeHtml(t("substitutionsTitle"))}</strong><ul>${localized.substitutions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
        ${localized.health ? `<div class="warning-box"><strong>${escapeHtml(t("safetyTitle"))}:</strong> ${escapeHtml(localized.health)}</div>` : ""}
      </section>
      <footer class="dialog-footer">
        ${proofItems ? `<h3>${escapeHtml(t("evidenceTitle"))}</h3><p class="modal-helper">${escapeHtml(t("evidenceDescription"))}</p><div class="proof-grid">${proofItems}</div>` : ""}
        <p class="recipe-credit">${escapeHtml(t("sourceRecipe"))}: <a href="${escapeHtml(recipe.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("openSource"))}</a> · ${escapeHtml(t("photoCredit"))}: <a href="${escapeHtml(image.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(image.author)} · ${escapeHtml(image.license)}</a></p>
        <div class="dialog-actions"><button class="action-button primary" type="button" data-copy-link>${escapeHtml(t("copyLink"))}</button><button class="action-button" type="button" data-print-recipe>${escapeHtml(t("print"))}</button></div>
      </footer>
    </div>
  `;

  state.activeRecipeId = recipe.id;
  return true;
}

function openRecipe(recipeId, updateUrl = true) {
  if (!renderRecipeDialog(recipeId)) return;
  if (updateUrl) history.pushState({ recipeId }, "", `#receta/${encodeURIComponent(recipeId)}`);
  if (!elements.recipeDialog.open) elements.recipeDialog.showModal();
  elements.recipeDialog.scrollTop = 0;
  updateModalState();
}

function closeRecipe(updateUrl = true) {
  if (elements.recipeDialog.open) elements.recipeDialog.close();
  state.activeRecipeId = null;
  if (updateUrl && location.hash.startsWith("#receta/")) history.replaceState(null, "", `${location.pathname}${location.search}#recipes`);
  updateModalState();
}

function renderSources() {
  elements.sourceList.innerHTML = Object.keys(evidence).map((key) => {
    const source = localizeEvidence(key);
    return `<a class="source-card" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(source.title)}</strong><span>${escapeHtml(source.provider)} · ${escapeHtml(source.kind || t("sourceTypeFallback"))}</span></a>`;
  }).join("");
}

function openSources() {
  renderSources();
  if (!elements.sourcesDialog.open) elements.sourcesDialog.showModal();
  updateModalState();
}

function closeSources() {
  if (elements.sourcesDialog.open) elements.sourcesDialog.close();
  updateModalState();
}

function updateModalState() {
  document.body.classList.toggle("modal-open", elements.recipeDialog.open || elements.sourcesDialog.open);
}

function syncFromHash() {
  if (!location.hash.startsWith("#receta/")) return;
  const recipeId = decodeURIComponent(location.hash.replace("#receta/", ""));
  openRecipe(recipeId, false);
}

async function copyRecipeLink() {
  const url = `${location.href.split("#")[0]}#receta/${encodeURIComponent(state.activeRecipeId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast(t("copied"));
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = url;
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.append(temporary);
    temporary.select();
    try {
      document.execCommand("copy");
      showToast(t("copied"));
    } catch {
      showToast(t("copyError"));
    }
    temporary.remove();
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}

function setLanguage(language) {
  if (!ui[language]) return;
  state.language = language;
  try {
    localStorage.setItem("sabores-language", language);
  } catch {}
  renderTranslations();
  renderRecipes();
  renderSources();
  if (state.activeRecipeId && elements.recipeDialog.open) renderRecipeDialog(state.activeRecipeId);
}

function setupInteractions() {
  document.addEventListener("click", (event) => {
    const recipeCard = event.target.closest("[data-recipe-id]");
    if (recipeCard) openRecipe(recipeCard.dataset.recipeId);

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      state.filter = filterButton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((button) => {
        const active = button === filterButton;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderRecipes();
    }

    const languageButton = event.target.closest("[data-language]");
    if (languageButton) setLanguage(languageButton.dataset.language);
    if (event.target.closest("[data-open-sources]")) openSources();
    if (event.target.closest("[data-close-sources]")) closeSources();
    if (event.target.closest("[data-close-recipe]")) closeRecipe();
    if (event.target.closest("[data-copy-link]")) copyRecipeLink();
    if (event.target.closest("[data-print-recipe]")) window.print();
    if (event.target.closest("[data-retry]")) renderRecipes();
  });

  elements.search.addEventListener("input", () => {
    state.query = elements.search.value.trim();
    renderRecipes();
  });

  elements.recipeDialogContent.addEventListener("change", (event) => {
    if (event.target.matches("[data-ingredient-index]") && state.activeRecipeId) saveChecklist(state.activeRecipeId);
  });

  for (const dialog of [elements.recipeDialog, elements.sourcesDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      if (dialog === elements.recipeDialog) closeRecipe();
      else closeSources();
    });
    dialog.addEventListener("close", updateModalState);
  }

  elements.recipeDialog.addEventListener("close", () => {
    state.activeRecipeId = null;
    if (location.hash.startsWith("#receta/")) history.replaceState(null, "", `${location.pathname}${location.search}#recipes`);
  });

  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#receta/")) syncFromHash();
    else if (elements.recipeDialog.open) closeRecipe(false);
  });
  window.addEventListener("popstate", () => {
    if (location.hash.startsWith("#receta/")) syncFromHash();
    else if (elements.recipeDialog.open) closeRecipe(false);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
      elements.search.select();
    }
  });
}

function setupRevealAnimation() {
  const reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveals.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -45px" });
  reveals.forEach((element) => observer.observe(element));
}

function initialize() {
  renderTranslations();
  renderRecipes();
  renderSources();
  setupInteractions();
  setupRevealAnimation();
  syncFromHash();
}

initialize();
