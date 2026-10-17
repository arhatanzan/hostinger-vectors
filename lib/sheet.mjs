import { parseCsv } from "./csv.mjs";

function sheetUrl() {
	const id = process.env.SHEET_ID?.trim();
	const gid = process.env.SHEET_GID?.trim();
	if (!id || !gid) throw new Error("SHEET_ID and SHEET_GID must be set");
	return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

export async function fetchSheetRows({ timeout = 10000 } = {}) {
	const response = await fetch(sheetUrl(), { signal: AbortSignal.timeout(timeout) });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const { keys, records } = parseCsv(await response.text());
	// A sheet that isn't shared publicly returns a sign-in page instead of CSV.
	if (!keys.includes("file")) throw new Error("no 'file' column; check the sheet is shared as 'Anyone with the link'");
	return records;
}
