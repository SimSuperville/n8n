/* eslint-disable @typescript-eslint/naming-convention -- output keys are user-facing labels */
import type { FormPage } from '../definition/types';
import { validateSubmission } from '../validation/validate';

const page: FormPage = {
	id: 'pg',
	elements: [
		{
			id: 'score',
			type: 'rating',
			label: 'Score',
			required: true,
			config: { style: 'scale', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' },
		},
	],
	logic: [],
};

describe('rating field', () => {
	it('coerces the submitted step to a number keyed by label', () => {
		const result = validateSubmission(page, { score: '4' });
		expect(result.errors).toEqual([]);
		expect(result.values).toEqual({ Score: 4 });
	});

	it('rejects out-of-range and non-integer values', () => {
		for (const raw of ['0', '6', '3.5', 'high']) {
			const result = validateSubmission(page, { score: raw });
			expect(result.errors).toEqual([expect.objectContaining({ elementId: 'score' })]);
		}
	});

	it('reports missing required rating', () => {
		const result = validateSubmission(page, {});
		expect(result.errors[0]?.message).toContain('required');
	});
});
