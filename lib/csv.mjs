export function parseCsv(input) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	const source = input.replace(/^\uFEFF/, "");

	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		if (quoted) {
			if (char === '"' && source[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[i + 1] === "\n") i += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}
	if (field || row.length) rows.push([...row, field]);

	const [header = [], ...body] = rows;
	const keys = header.map((key) => key.trim().toLowerCase());
	const records = body
		.filter((cells) => cells.some((cell) => cell.trim()))
		.map((cells) => Object.fromEntries(keys.flatMap((key, index) => (key ? [[key, cells[index] ?? ""]] : []))));
	return { keys, records };
}
