// Builds public/data/collection.json: an index of images on disk plus a fallback copy of the sheet.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSheetRows, SHEET_URL } from "../lib/sheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const sourceDir = path.join(publicDir, "illustrations");
const snapshotFile = path.join(root, "data", "illustrations.snapshot.json");
const outputFile = path.join(publicDir, "data", "collection.json");
const IMAGE = /\.(png|jpe?g|webp|avif)$/i;
const PREVIEW_WIDTH = 1600;

const toPosix = (value) => value.split(path.sep).join("/");
const imageKey = (value) => String(value ?? "").trim().split("/").pop().replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase();

async function loadRows() {
	try {
		const rows = await fetchSheetRows();
		await mkdir(path.dirname(snapshotFile), { recursive: true });
		await writeFile(snapshotFile, `${JSON.stringify({ source: SHEET_URL, fetchedAt: new Date().toISOString(), rows }, null, "\t")}\n`);
		console.log(`Fetched ${rows.length} row(s) from the sheet.`);
		return rows;
	} catch (error) {
		console.warn(`! Could not read the sheet (${error.message}); using the saved snapshot.`);
		try {
			const data = JSON.parse(await readFile(snapshotFile, "utf8"));
			return Array.isArray(data?.rows) ? data.rows : [];
		} catch {
			console.warn("! No saved snapshot available.");
			return [];
		}
	}
}

async function findImages(dir) {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const nested = await Promise.all(entries.map((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return findImages(full);
		return IMAGE.test(entry.name) ? [full] : [];
	}));
	return nested.flat();
}

async function loadSharp() {
	try {
		return (await import("sharp")).default;
	} catch {
		console.warn("! sharp is not installed; originals will be used as previews.");
		return null;
	}
}

async function describeImage(sharp, file) {
	if (!sharp) return {};
	const source = path.join(publicDir, file);
	const preview = `previews/${file.replace(/^illustrations\//, "").replace(IMAGE, ".webp")}`;
	const target = path.join(publicDir, preview);
	try {
		const [{ width, height }, sourceStat, targetStat] = await Promise.all([
			sharp(source).metadata(),
			stat(source),
			stat(target).catch(() => null),
		]);
		if (!targetStat || targetStat.mtimeMs < sourceStat.mtimeMs) {
			await mkdir(path.dirname(target), { recursive: true });
			await sharp(source).resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(target);
		}
		return { preview, width, height };
	} catch (error) {
		console.warn(`! Could not process ${file}: ${error.message}`);
		return {};
	}
}

async function buildLogo(sharp) {
	if (!sharp) return;
	const source = path.join(publicDir, "assets", "brand", "kaif-abbas.png");
	try {
		await sharp(source).resize(160, 160).webp({ quality: 85 }).toFile(source.replace(/\.png$/, "-160.webp"));
	} catch (error) {
		console.warn(`! Could not build logo: ${error.message}`);
	}
}

const [rows, sharp] = await Promise.all([loadRows(), loadSharp()]);
await buildLogo(sharp);

const files = (await findImages(sourceDir)).map((image) => toPosix(path.relative(publicDir, image))).sort();
const images = {};
for (const file of files) {
	const key = imageKey(file);
	if (images[key]) {
		console.warn(`! Duplicate image name "${key}": using ${images[key].file}, ignoring ${file}.`);
		continue;
	}
	images[key] = { file, ...(await describeImage(sharp, file)) };
}

const referenced = new Set(rows.map((row) => imageKey(row?.file)).filter(Boolean));
for (const key of referenced) if (!images[key]) console.warn(`! Sheet references "${key}", but no such image is in public/illustrations/.`);
for (const key of Object.keys(images)) if (!referenced.has(key)) console.log(`  · ${images[key].file} is not in the sheet (not shown).`);

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), images, rows }, null, "\t")}\n`);
console.log(`Built image index: ${files.length} image(s), ${rows.length} fallback sheet row(s).`);
