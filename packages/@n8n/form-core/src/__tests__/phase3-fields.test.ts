/* eslint-disable @typescript-eslint/naming-convention -- output keys are user-facing labels */
import type { FormPage } from '../definition/types';
import { validateSubmission } from '../validation/validate';

const page: FormPage = {
	id: 'pg',
	elements: [
		{ id: 'nps', type: 'opinionScale', label: 'NPS', required: true },
		{ id: 'tel', type: 'phone', label: 'Phone' },
		{ id: 'site', type: 'url', label: 'Site' },
		{ id: 'optin', type: 'yesNo', label: 'Opt in' },
		{ id: 'info', type: 'statement', label: 'About', config: { text: 'hello' } },
	],
	logic: [],
};

describe('phase 3 field types', () => {
	it('coerces valid values with correct types', () => {
		const result = validateSubmission(page, {
			nps: '9',
			tel: '+49 (30) 1234-567',
			site: 'https://n8n.io',
			optin: 'true',
		});
		expect(result.errors).toEqual([]);
		expect(result.values).toEqual({
			NPS: 9,
			Phone: '+49 (30) 1234-567',
			Site: 'https://n8n.io',
			'Opt in': true,
		});
	});

	it('rejects out-of-range NPS, bad phone, bad url; drops unparseable yesNo', () => {
		const result = validateSubmission(page, {
			nps: '11',
			tel: 'abc',
			site: 'not a url',
			optin: 'maybe',
		});
		expect(result.errors.map((e) => e.elementId).sort()).toEqual(['nps', 'site', 'tel']);
		expect(result.values).not.toHaveProperty('Opt in');
	});

	it('statement produces no output value', () => {
		const result = validateSubmission(page, { nps: '5', info: 'ignored' });
		expect(result.values).toEqual({ NPS: 5 });
	});
});
