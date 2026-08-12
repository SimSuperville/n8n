/**
 * Data table column names must match Postgres identifier rules:
 * start with a letter, then letters/digits/underscores, max 63 chars.
 */
const COLUMN_MAX_LENGTH = 63;

/** Converts a form output key (often a human label) into a valid data table column name */
export function toDataTableColumnName(input: string): string {
	let name = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (name === '') name = 'field';
	if (!/^[a-z]/.test(name)) name = `f_${name}`;
	return name.slice(0, COLUMN_MAX_LENGTH);
}

/** Like toDataTableColumnName, but suffixes _2, _3, … to avoid names already taken */
export function toUniqueDataTableColumnName(input: string, taken: Set<string>): string {
	const base = toDataTableColumnName(input);
	if (!taken.has(base)) return base;
	for (let i = 2; ; i++) {
		const suffix = `_${i}`;
		const candidate = base.slice(0, COLUMN_MAX_LENGTH - suffix.length) + suffix;
		if (!taken.has(candidate)) return candidate;
	}
}
