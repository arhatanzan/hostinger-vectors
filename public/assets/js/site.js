import { parseCsv } from "./csv.js";

const LIVE_SOURCE = "api/illustrations";
const SHEET_SOURCE = "https://docs.google.com/spreadsheets/d/1UIpV8mZ21NTqJUWMbw5NK1V4cWFjuTbRUxpxlvOWljk/gviz/tq?tqx=out:csv&headers=1&gid=526555760";
const BUILD_SOURCE = "data/collection.json";
const DEFAULT_RATIO = "3 / 2";
const SAFE_PATH = /^(illustrations|previews)\/(?!.*\.\.)[\w\-./ ]+\.(png|jpe?g|webp|avif|gif)$/i;
const UNCATEGORIZED = "Uncategorized";

const $ = (selector) => document.querySelector(selector);
const pad = (value) => String(value).padStart(2, "0");
const text = (value) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const positive = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
const titleCase = (value) => value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
const imageKey = (value) => text(value).split("/").pop().replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase();

function flag(value, fallback) {
	const normalized = text(value).toLowerCase();
	if (value === true || ["1", "true", "yes", "y"].includes(normalized)) return true;
	if (value === false || ["0", "false", "no", "n"].includes(normalized)) return false;
	return fallback;
}

function element(tag, className, content) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (content) node.textContent = content;
	return node;
}

function cleanPath(value) {
	const path = text(value).replace(/^\/+/, "");
	return SAFE_PATH.test(path) ? encodeURI(path) : "";
}

function categoriesOf(value) {
	const seen = new Map();
	for (const part of text(value).split(/[,;|]/)) {
		const name = part.trim();
		if (!name) continue;
		const label = name === name.toLowerCase() ? titleCase(name) : name;
		if (!seen.has(slugify(label))) seen.set(slugify(label), label);
	}
	if (!seen.size) seen.set(slugify(UNCATEGORIZED), UNCATEGORIZED);
	return [...seen].map(([id, label]) => ({ id, label }));
}

function normalize(row, index, images) {
	if (!row || typeof row !== "object" || !flag(row.flag, true)) return null;
	const key = imageKey(row.file);
	const image = key && images[key];
	const file = cleanPath(image?.file);
	if (!file) return null;

	const title = text(row.title) || titleCase(key);
	const width = positive(image.width);
	const height = positive(image.height);

	return {
		id: text(row.id) || `row-${index + 2}`,
		file,
		preview: cleanPath(image.preview) || file,
		title,
		subtitle: text(row.subtitle),
		categories: categoriesOf(row.category),
		alt: text(row.alt) || title,
		aiGenerated: flag(row.aigenerated ?? row.aiGenerated, true),
		featured: flag(row.featured, false),
		ratio: width && height ? `${width} / ${height}` : DEFAULT_RATIO,
	};
}

async function getJson(url, timeout) {
	try {
		const response = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(timeout) });
		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
}

async function getSheetRows(timeout) {
	try {
		const response = await fetch(SHEET_SOURCE, { cache: "no-store", signal: AbortSignal.timeout(timeout) });
		if (!response.ok) return null;
		const { keys, records } = parseCsv(await response.text());
		return keys.includes("file") ? records : null;
	} catch {
		return null;
	}
}

async function loadLiveRows() {
	const live = await getJson(LIVE_SOURCE, 8000);
	return Array.isArray(live?.rows) ? live.rows : getSheetRows(8000);
}

async function loadWorks() {
	const [build, liveRows] = await Promise.all([getJson(BUILD_SOURCE, 10000), loadLiveRows()]);
	const images = build?.images && typeof build.images === "object" ? build.images : {};
	const rows = [liveRows, build?.rows].find(Array.isArray) ?? [];
	const seen = new Set();
	return rows
		.map((row, index) => normalize(row, index, images))
		.filter((work) => work && !seen.has(work.id) && seen.add(work.id));
}

function setupLogo() {
	const mark = $(".brand-mark");
	const logo = mark?.querySelector("img");
	if (!logo) return;

	const onError = () => {
		const fallback = logo.dataset.fallback;
		if (fallback && logo.getAttribute("src") !== fallback) {
			logo.src = fallback;
		} else {
			mark.classList.add("is-fallback");
		}
	};
	logo.addEventListener("error", onError);
	if (logo.complete && logo.naturalWidth === 0) onError();
}

const dialog = $("#art-dialog");
const dialogFrame = dialog.querySelector(".dialog-frame");
const dialogImage = $("#dialog-image");

function openDialog(work) {
	dialogFrame.classList.remove("is-missing");
	dialogImage.src = work.file;
	dialogImage.alt = work.alt;
	$("#dialog-category").textContent = work.categories.map((category) => category.label).join(" · ");
	$("#dialog-ai").hidden = !work.aiGenerated;
	$("#dialog-title").textContent = work.title;
	$("#dialog-subtitle").textContent = work.subtitle;
	dialog.showModal();
}

dialogImage.addEventListener("error", () => dialogFrame.classList.add("is-missing"));
dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
	if (event.target === dialog) dialog.close();
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && dialog.open) dialog.close();
});

function markMissing(frame) {
	frame.classList.add("is-missing");
	frame.disabled = true;
	frame.replaceChildren(element("span", "missing-label", "Image unavailable"));
}

function fillFrame(frame, work, eager = false) {
	frame.classList.remove("is-missing");
	frame.disabled = false;
	frame.style.aspectRatio = work.ratio;
	frame.setAttribute("aria-label", `View “${work.title}” full size`);

	const image = element("img");
	image.alt = work.alt;
	image.decoding = "async";
	image.loading = eager ? "eager" : "lazy";
	image.addEventListener("error", () => {
		if (image.getAttribute("src") !== work.file) image.src = work.file;
		else markMissing(frame);
	});
	image.src = work.preview;

	frame.replaceChildren(image);
	frame.onclick = () => openDialog(work);
}

function createCard(work) {
	const card = element("article", "work-card");
	const frame = element("button", "frame");
	frame.type = "button";
	fillFrame(frame, work);

	const badges = element("span", "work-badges");
	if (work.featured) badges.append(element("span", "featured-badge", "Featured"));
	if (work.aiGenerated) badges.append(element("span", "ai-badge", "AI-generated"));

	const meta = element("div", "work-meta");
	meta.append(element("span", "work-category", work.categories.map((category) => category.label).join(" · ")), badges);

	card.append(frame, meta, element("h3", "work-title", work.title));
	if (work.subtitle) card.append(element("p", "work-subtitle", work.subtitle));
	return card;
}

function groupsOf(works) {
	const groups = new Map();
	for (const work of works) {
		for (const { id, label } of work.categories) {
			const group = groups.get(id) ?? { id, label, count: 0 };
			group.count += 1;
			groups.set(id, group);
		}
	}
	return [...groups.values()];
}

function createGallery(works) {
	const grid = $("#work-grid");
	const filters = $("#filters");
	const count = $("#work-count");
	const groups = groupsOf(works);
	let active = "all";

	function render() {
		const visible = works.filter((work) => active === "all" || work.categories.some((category) => category.id === active));
		count.textContent = `${pad(visible.length)} ${visible.length === 1 ? "work" : "works"}`;
		grid.replaceChildren(...visible.map(createCard));
		for (const button of filters.children) {
			const isActive = button.dataset.filter === active;
			button.classList.toggle("is-active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
		}
	}

	function setFilter(id) {
		active = id === "all" || groups.some((group) => group.id === id) ? id : "all";
		render();
	}

	const filterButtons = [{ id: "all", label: "All work" }, ...groups].map(({ id, label }) => {
		const button = element("button", "filter-button", label);
		button.type = "button";
		button.dataset.filter = id;
		button.addEventListener("click", () => setFilter(id));
		return button;
	});
	filters.replaceChildren(...filterButtons);
	filters.hidden = groups.length < 2;

	render();
	return { groups, setFilter };
}

function renderIndex(works, { groups, setFilter }) {
	$("#index-total").textContent = pad(works.length);
	$("#index-list").replaceChildren(...groups.map((group) => {
		const item = element("li");
		const button = element("button", "index-item");
		button.type = "button";
		button.append(element("span", "index-name", group.label), element("span", "index-count", pad(group.count)));
		button.addEventListener("click", () => {
			setFilter(group.id);
			$("#works").scrollIntoView();
		});
		item.append(button);
		return item;
	}));
}

function renderFeatured(works) {
	const picks = works.filter((work) => work.featured);
	const featured = picks.length ? picks : works.slice(0, 1);
	const figure = $("#featured");
	const pager = $("#featured-pager");
	if (!featured.length) return;

	let current = 0;
	const show = (index) => {
		current = (index + featured.length) % featured.length;
		fillFrame(figure.querySelector(".frame"), featured[current], true);
		$("#featured-title").textContent = featured[current].title;
		$("#featured-position").textContent = `${pad(current + 1)} / ${pad(featured.length)}`;
	};

	pager.hidden = featured.length < 2;
	pager.querySelector("[data-step='-1']").onclick = () => show(current - 1);
	pager.querySelector("[data-step='1']").onclick = () => show(current + 1);
	show(0);
	figure.hidden = false;
}

function renderAiNotice(works) {
	const aiCount = works.filter((work) => work.aiGenerated).length;
	const notice = $("#ai-notice-text");
	for (const selector of ["#ai-notice", "#about-ai", "#nav-about-ai", "#footer-ai"]) $(selector).hidden = aiCount === 0;
	notice.textContent = aiCount === works.length
		? "Every illustration here is created with generative AI tools and curated by Kaif Abbas."
		: "Works labeled AI-generated are created with generative AI tools and curated by Kaif Abbas.";
}

function renderEmpty() {
	$("#filters").hidden = true;
	$("#work-count").textContent = "";
	$("#index-total").textContent = pad(0);
	$("#work-grid").replaceChildren(element("p", "empty-state", "New illustrations are on the way."));
}

async function init() {
	setupLogo();
	try {
		const works = await loadWorks();
		if (!works.length) return renderEmpty();
		renderAiNotice(works);
		renderFeatured(works);
		renderIndex(works, createGallery(works));
	} catch (error) {
		console.error("Could not render the collection.", error);
		renderEmpty();
	}
}

init();
