import { toDataTableColumnName, toUniqueDataTableColumnName } from '../utils/column-name';

describe('toDataTableColumnName', () => {
	it('slugifies labels into valid column names', () => {
		expect(toDataTableColumnName('Rate your experience')).toBe('rate_your_experience');
		expect(toDataTableColumnName('  What could we improve?  ')).toBe('what_could_we_improve');
		expect(toDataTableColumnName('Émail (work)')).toBe('mail_work');
	});

	it('prefixes names that do not start with a letter', () => {
		expect(toDataTableColumnName('123 count')).toBe('f_123_count');
	});

	it('falls back for empty input and caps length at 63', () => {
		expect(toDataTableColumnName('!!!')).toBe('field');
		expect(toDataTableColumnName('x'.repeat(100))).toHaveLength(63);
	});
});

describe('toUniqueDataTableColumnName', () => {
	it('suffixes collisions', () => {
		const taken = new Set(['rating', 'rating_2']);
		expect(toUniqueDataTableColumnName('Rating', taken)).toBe('rating_3');
		expect(toUniqueDataTableColumnName('Other', taken)).toBe('other');
	});

	it('keeps suffixed names within the length limit', () => {
		const long = 'y'.repeat(80);
		const taken = new Set([toDataTableColumnName(long)]);
		const result = toUniqueDataTableColumnName(long, taken);
		expect(result).toHaveLength(63);
		expect(result.endsWith('_2')).toBe(true);
	});
});
