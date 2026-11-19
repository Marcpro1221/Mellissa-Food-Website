import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const selections = [
  ["adobo-pollo", "Chicken adobo.jpg", "Plato de chicken adobo con pollo en salsa oscura", "A plate of chicken adobo in a dark savory sauce"],
  ["sinigang-cerdo", "Sinigang na Baboy.jpg", "Tazón de sinigang na baboy con cerdo y vegetales", "A bowl of sinigang na baboy with pork and vegetables"],
  ["pancit-bihon", "Pancit bihon 3.jpg", "Pancit bihon servido con fideos de arroz, pollo y vegetales", "Pancit bihon served with rice noodles, chicken, and vegetables"],
  ["lumpia-shanghai", "Lumpiang Shanghai 2023.jpg", "Lumpiang Shanghai dorados servidos en un plato", "Golden lumpiang Shanghai served on a plate"],
  ["tinola", "Chicken tinola with green papaya and lemongrass.jpg", "Sopa tinolang manok con pollo y papaya verde", "Tinolang manok soup with chicken and green papaya"],
  ["kare-kare", "Kare-kare (Philippines) 03.jpg", "Kare-kare filipino con carne y vegetales", "Filipino kare-kare with meat and vegetables"],
  ["tortang-talong", "580Pastilas Tortang talong 02.jpg", "Tortang talong de berenjena y huevo", "Eggplant and egg tortang talong"],
  ["lechon-kawali", "Lechon Kawali - BRUHA 2024-05-23.jpg", "Trozos crujientes de lechon kawali", "Crispy pieces of lechon kawali"],
  ["bistek", "Bistek Tagalog-01.jpg", "Bistek Tagalog con res y aros de cebolla", "Bistek Tagalog with beef and onion rings"],
  ["arroz-caldo", "Arroz Caldo.jpg", "Tazón de arroz caldo filipino", "A bowl of Filipino arroz caldo"],
  ["afritada", "Chicken Afritada, Mar 2024.jpg", "Chicken afritada en salsa de tomate con vegetales", "Chicken afritada in tomato sauce with vegetables"],
  ["chicken-inasal", "Chicken inasal (Philippines).jpg", "Chicken inasal asado con arroz", "Grilled chicken inasal with rice"],
  ["leche-flan", "Leche flan (Philippines) 03.jpg", "Leche flan filipino cubierto de caramelo", "Filipino leche flan topped with caramel"],
  ["mango-float", "Mango float, a Filipino icebox cake version of Crema de Fruta 02.jpg", "Porción de mango float filipino", "A serving of Filipino mango float"],
  ["turon", "Turon na Saging.jpg", "Turon de plátano frito y caramelizado", "Fried caramelized banana turon"],
  ["banana-cue", "Banana cue on Bamboo skewers in the Philippines.jpg", "Banana cue caramelizado en brochetas de bambú", "Caramelized banana cue on bamboo skewers"],
  ["maja-blanca", "Maja Blanca (Coconut Pudding).jpg", "Maja blanca filipina de coco y maíz", "Filipino coconut and corn maja blanca"],
  ["cassava-cake", "Cassava cake (Philippines) 2.jpg", "Porciones de pastel filipino de yuca", "Slices of Filipino cassava cake"],
  ["polvoron", "POLVORON FOR DESSERT.jpg", "Polvorones filipinos moldeados y listos para servir", "Molded Filipino polvoron ready to serve"],
  ["biko", "Biko (sticky rice cake).jpg", "Biko filipino de arroz glutinoso y coco", "Filipino sticky rice and coconut biko"],
  ["puto", "Puto (Filipino rice cake) with cheese.jpg", "Pastelitos puto filipinos con queso", "Filipino puto rice cakes with cheese"],
  ["halo-halo", "Halu-halo.jpg", "Halo-halo filipino con hielo, frutas y ube", "Filipino halo-halo with shaved ice, fruit, and ube"],
  ["ginataang-mais", "Ginataang mais (Sweet corn rice porridge, Philippines).jpg", "Ginataang mais cremoso con arroz, coco y maíz", "Creamy ginataang mais with rice, coconut, and corn"],
  ["buko-salad", "Buko Fruit Salad by Isi Laureano.jpg", "Buko salad filipina con coco tierno y frutas", "Filipino buko salad with young coconut and fruit"]
];

const outputDirectory = path.resolve("public/images/recipes");
const manifestPath = path.resolve("src/recipe-images.json");
const shouldDownload = process.argv.includes("--download");

function stripHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url, originalUrl, title) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "FilipinoDish/1.0 image-sourcing" } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status !== 429) throw new Error(`Image download returned ${response.status} for ${title}`);
    await wait(attempt * 1200);
  }
  const originalResponse = await fetch(originalUrl, { headers: { "user-agent": "FilipinoDish/1.0 image-sourcing" } });
  if (!originalResponse.ok) throw new Error(`Original image download returned ${originalResponse.status} for ${title}`);
  return Buffer.from(await originalResponse.arrayBuffer());
}

async function fetchBatch(batch) {
  const parameters = new URLSearchParams({
    action: "query",
    titles: batch.map((selection) => `File:${selection[1]}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "960",
    format: "json",
    origin: "*"
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${parameters}`, {
    headers: { "user-agent": "FilipinoDish/1.0 image-sourcing" }
  });
  if (!response.ok) throw new Error(`Commons API returned ${response.status}`);
  const data = await response.json();
  return Object.values(data.query?.pages ?? {});
}

const pages = [];
for (let index = 0; index < selections.length; index += 8) {
  pages.push(...await fetchBatch(selections.slice(index, index + 8)));
}

const pagesByTitle = new Map(pages.map((page) => [page.title.replace(/^File:/, ""), page]));
const manifest = {};

if (shouldDownload) await mkdir(outputDirectory, { recursive: true });

for (const [id, title, altEs, altEn] of selections) {
  const page = pagesByTitle.get(title);
  const imageInfo = page?.imageinfo?.[0];
  if (!imageInfo) throw new Error(`Image metadata was not found for ${title}`);

  const metadata = imageInfo.extmetadata ?? {};
  const imageUrl = imageInfo.thumburl ?? imageInfo.url;
  const imagePath = `/images/recipes/${id}.jpg`;
  const author = stripHtml(metadata.Artist?.value);
  manifest[id] = {
    src: imagePath,
    width: imageInfo.thumbwidth ?? 960,
    height: imageInfo.thumbheight ?? 640,
    alt: { es: altEs, en: altEn },
    title,
    author: !author || author.includes("???") || author === "Self" ? "Wikimedia Commons contributor" : author,
    source: imageInfo.descriptionurl,
    license: metadata.LicenseShortName?.value || "See source page",
    licenseUrl: metadata.LicenseUrl?.value || imageInfo.descriptionurl
  };

  if (shouldDownload) {
    const filePath = path.join(outputDirectory, `${id}.jpg`);
    if (!await fileExists(filePath)) {
      await writeFile(filePath, await downloadImage(imageUrl, imageInfo.url, title));
      await wait(800);
    }
  }
}

if (shouldDownload) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
