import { fetchSheetRows } from "../../lib/sheet.mjs";

export default async () => {
	try {
		const rows = await fetchSheetRows({ timeout: 8000 });
		return Response.json({ fetchedAt: new Date().toISOString(), rows }, {
			headers: {
				"Cache-Control": "public, max-age=0, must-revalidate",
				"Netlify-CDN-Cache-Control": "public, durable, s-maxage=60, stale-while-revalidate=300",
			},
		});
	} catch (error) {
		console.error(`Could not read the illustrations sheet: ${error.message}`);
		return Response.json({ error: "Sheet unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
	}
};

export const config = { path: "/api/illustrations" };
