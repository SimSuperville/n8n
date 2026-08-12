/* eslint-disable @typescript-eslint/naming-convention -- output keys are user-facing labels */
import type { FormPage } from '../definition/types';
import { validateSubmission } from '../validation/validate';

const page: FormPage = {
	id: 'pg',
	elements: [
		{ id: 'name', type: 'text', label: 'Name', required: true },
		{ id: 'mail', type: 'email', label: 'Email', required: true },
		{ id: 'age', type: 'number', label: 'Age', config: { min: 18, max: 99 } },
		{
			id: 'color',
			type: 'dropdown',
			label: 'Color',
			config: {
				options: [
					{ id: 'o1', label: 'Red' },
					{ id: 'o2', label: 'Blue' },
				],
			},
		},
		{
			id: 'why',
			type: 'textarea',
			label: 'Why?',
		},
		{ id: 'note', type: 'html', label: '', config: { html: '<p>hi</p>' } },
	],
	logic: [
		{
			id: 'r1',
			when: {
				combinator: 'all',
				conditions: [{ elementId: 'color', operator: 'eq', value: 'Red' }],
			},
			actions: [{ type: 'show', targetElementId: 'why' }],
		},
	],
};

describe('validateSubmission', () => {
	it('coerces and returns values keyed by output key', () => {
		const result = validateSubmission(page, {
			name: '  Jane  ',
			mail: 'jane@acme.com',
			age: '42',
			color: 'o2',
		});
		expect(result.errors).toEqual([]);
		expect(result.values).toEqual({
			Name: 'Jane',
			Email: 'jane@acme.com',
			Age: 42,
			Color: 'Blue',
		});
		expect(result.hiddenElementIds).toContain('why');
	});

	it('reports missing required fields', () => {
		const result = validateSubmission(page, { color: 'o1' });
		const elementIds = result.errors.map((error) => error.elementId);
		expect(elementIds).toEqual(expect.arrayContaining(['name', 'mail']));
	});

	it('rejects invalid email and out-of-range numbers', () => {
		const result = validateSubmission(page, {
			name: 'Jane',
			mail: 'not-an-email',
			age: '12',
			color: 'o1',
			why: 'because',
		});
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ elementId: 'mail' }),
				expect.objectContaining({ elementId: 'age' }),
			]),
		);
	});

	it('rejects tampered choice values not in the option set', () => {
		const result = validateSubmission(page, {
			name: 'Jane',
			mail: 'jane@acme.com',
			color: 'evil-value',
		});
		expect(result.errors).toEqual(
			expect.arrayContaining([expect.objectContaining({ elementId: 'color' })]),
		);
	});

	it('discards values of elements hidden by logic', () => {
		const result = validateSubmission(page, {
			name: 'Jane',
			mail: 'jane@acme.com',
			color: 'o2',
			why: 'should be dropped',
		});
		expect(result.errors).toEqual([]);
		expect(result.values).not.toHaveProperty('Why?');
		expect(result.hiddenElementIds).toContain('why');
	});

	it('keeps values of elements shown by logic', () => {
		const result = validateSubmission(page, {
			name: 'Jane',
			mail: 'jane@acme.com',
			color: 'o1',
			why: 'kept',
		});
		expect(result.errors).toEqual([]);
		expect(result.values).toHaveProperty('Why?', 'kept');
	});
});
