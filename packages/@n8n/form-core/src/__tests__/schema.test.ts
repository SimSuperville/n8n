import { parseFormDefinition, safeParseFormDefinition } from '../definition/schema';
import type { FormDefinition } from '../definition/types';

const validDefinition: FormDefinition = {
	version: 1,
	id: 'frm1',
	title: 'Customer feedback',
	layout: { mode: 'classic' },
	theme: {},
	page: {
		id: 'pg1',
		elements: [
			{ id: 'el1', type: 'number', label: 'Rating', required: true },
			{ id: 'el2', type: 'textarea', label: 'Comments' },
		],
		logic: [
			{
				id: 'r1',
				when: { combinator: 'all', conditions: [{ elementId: 'el1', operator: 'lt', value: 4 }] },
				actions: [{ type: 'show', targetElementId: 'el2' }],
			},
		],
	},
};

describe('parseFormDefinition', () => {
	it('accepts a valid definition object', () => {
		expect(parseFormDefinition(validDefinition)).toEqual(validDefinition);
	});

	it('accepts a valid definition as a JSON string', () => {
		expect(parseFormDefinition(JSON.stringify(validDefinition))).toEqual(validDefinition);
	});

	it('rejects invalid JSON strings', () => {
		expect(() => parseFormDefinition('{nope')).toThrowError('not valid JSON');
	});

	it('rejects missing required properties', () => {
		const { page, ...withoutPage } = validDefinition;
		expect(() => parseFormDefinition(withoutPage)).toThrowError('page');
	});

	it('rejects duplicate element ids', () => {
		const definition = structuredClone(validDefinition);
		definition.page.elements[1].id = 'el1';
		expect(() => parseFormDefinition(definition)).toThrowError('Duplicate element id');
	});

	it('rejects duplicate output keys', () => {
		const definition = structuredClone(validDefinition);
		definition.page.elements[1].label = 'Rating';
		definition.page.logic = [];
		expect(() => parseFormDefinition(definition)).toThrowError('Duplicate output key');
	});

	it('rejects logic that references unknown elements', () => {
		const definition = structuredClone(validDefinition);
		definition.page.logic[0].when.conditions[0].elementId = 'ghost';
		expect(() => parseFormDefinition(definition)).toThrowError('unknown element');
	});

	it('safeParse returns issues instead of throwing', () => {
		const result = safeParseFormDefinition({ version: 2 });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.issues.length).toBeGreaterThan(0);
	});
});
