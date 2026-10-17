import { parseCsv } from "../public/assets/js/csv.js";

const SHEET_ID = process.env.ILLUSTRATIONS_SHEET_ID || "1UIpV8mZ21NTqJUWMbw5NK1V4cWFjuTbRUxpxlvOWljk";
const SHEET_GID = process.env.ILLUSTRATIONS_SHEET_GID || "526555760";

export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

export async function fetchSheetRows({ timeout = 10000 } = {}) {
	const response = await fetch(SHEET_URL, { signal: AbortSignal.timeout(timeout) });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const { keys, records } = parseCsv(await response.text());
	// A sheet that isn't shared publicly returns a sign-in page instead of CSV.
	if (!keys.includes("file")) throw new Error("no 'file' column; check the sheet is shared as 'Anyone with the link'");
	return records;
}
