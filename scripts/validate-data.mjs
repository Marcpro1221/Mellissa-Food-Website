import recipeData from "../recetas.json" with { type: "json" };
import recipeImages from "../src/recipe-images.json" with { type: "json" };
import { evidenceEn, recipesEn, ui } from "../src/i18n.js";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const errors = [];
const recipeIds = new Set();
const categories = { comida: 0, postre: 0 };

for (const recipe of recipeData.recipes) {
  if (recipeIds.has(recipe.id)) errors.push(`Duplicate recipe id: ${recipe.id}`);
  recipeIds.add(recipe.id);

  if (!(recipe.category in categories)) errors.push(`Invalid category on ${recipe.id}: ${recipe.category}`);
  else categories[recipe.category] += 1;

  if (!recipe.name || !recipe.spanish) errors.push(`Missing title on ${recipe.id}`);
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) errors.push(`Missing ingredients on ${recipe.id}`);
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 3) errors.push(`Not enough preparation steps on ${recipe.id}`);

  try {
    new URL(recipe.source);
  } catch {
    errors.push(`Invalid recipe source URL on ${recipe.id}`);
  }

  const translation = recipesEn[recipe.id];
  if (!translation) {
    errors.push(`Missing English translation for ${recipe.id}`);
  } else {
    if (translation.ingredients.length !== recipe.ingredients.length) errors.push(`Ingredient translation count mismatch on ${recipe.id}`);
    if (translation.steps.length !== recipe.steps.length) errors.push(`Step translation count mismatch on ${recipe.id}`);
  }

  const image = recipeImages[recipe.id];
  if (!image) {
    errors.push(`Missing recipe image for ${recipe.id}`);
  } else {
    const imagePath = path.resolve("public", image.src.replace(/^\//, ""));
    if (!existsSync(imagePath)) errors.push(`Missing image file for ${recipe.id}: ${image.src}`);
    else if (statSync(imagePath).size < 10000) errors.push(`Image file is unexpectedly small for ${recipe.id}`);
    if (!image.alt?.es || !image.alt?.en) errors.push(`Missing bilingual image alt text for ${recipe.id}`);
    if (!image.source || !image.author || !image.license) errors.push(`Incomplete image credit for ${recipe.id}`);
  }

  for (const ingredient of recipe.ingredients) {
    for (const evidenceKey of ingredient.evidence ?? []) {
      if (!recipeData.evidence[evidenceKey]) errors.push(`Missing evidence ${evidenceKey} referenced by ${recipe.id}`);
    }
  }
}

for (const [key, source] of Object.entries(recipeData.evidence)) {
  try {
    new URL(source.url);
  } catch {
    errors.push(`Invalid evidence URL: ${key}`);
  }
  if (!evidenceEn[key]) errors.push(`Missing English evidence label: ${key}`);
}

for (const recipeId of Object.keys(recipesEn)) {
  if (!recipeIds.has(recipeId)) errors.push(`English translation has unknown recipe id: ${recipeId}`);
}

for (const recipeId of Object.keys(recipeImages)) {
  if (!recipeIds.has(recipeId)) errors.push(`Image manifest has unknown recipe id: ${recipeId}`);
}

const imagePaths = Object.values(recipeImages).map((image) => image.src);
if (new Set(imagePaths).size !== imagePaths.length) errors.push("Recipe image paths must be unique");
if (recipeImages["ginataang-mais"]?.src === recipeImages["buko-salad"]?.src) errors.push("Ginataang Mais and Buko Salad must use different images");

const spanishKeys = Object.keys(ui.es).sort();
const englishKeys = Object.keys(ui.en).sort();
if (JSON.stringify(spanishKeys) !== JSON.stringify(englishKeys)) errors.push("Spanish and English interface keys do not match");
if (recipeData.recipes.length !== 24) errors.push(`Expected 24 recipes, found ${recipeData.recipes.length}`);
if (categories.comida !== 12 || categories.postre !== 12) errors.push(`Expected 12 dishes and 12 desserts, found ${categories.comida} and ${categories.postre}`);

if (errors.length) {
  console.error("Data validation failed:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${recipeData.recipes.length} recipes, ${Object.keys(recipeData.evidence).length} sources, ${imagePaths.length} unique photos, and complete ES/EN content.`);
