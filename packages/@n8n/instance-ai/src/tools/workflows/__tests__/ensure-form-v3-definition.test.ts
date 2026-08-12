import { safeParseFormDefinition } from '@n8n/form-core';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import { describe, expect, it } from 'vitest';

import { ensureFormV3Definition } from '../ensure-form-v3-definition';

const FORM_TRIGGER = 'n8n-nodes-base.formTrigger';
const FORM_NODE = 'n8n-nodes-base.form';

function workflowWith(nodes: WorkflowJSON['nodes']): WorkflowJSON {
	return { name: 'test', nodes, connections: {} } as WorkflowJSON;
}

describe('ensureFormV3Definition', () => {
	it('converts legacy formFields into a valid v3 formDefinition preserving fields', () => {
		const json = workflowWith([
			{
				id: '1',
				name: 'On form submission',
				type: FORM_TRIGGER,
				typeVersion: 2.6,
				position: [0, 0],
				parameters: {
					formTitle: 'Feedback',
					formDescription: 'Tell us',
					formFields: {
						values: [
							{ fieldLabel: 'Name', fieldType: 'text', requiredField: true },
							{
								fieldLabel: 'Rating',
								fieldType: 'dropdown',
								fieldOptions: { values: [{ option: '1' }, { option: '5' }] },
							},
						],
					},
				},
			},
		]);

		ensureFormV3Definition(json);

		const node = json.nodes[0];
		expect(node.typeVersion).toBe(3);
		expect(node.parameters?.formFields).toBeUndefined();
		expect(node.parameters?.formTitle).toBeUndefined();
		const parsed = safeParseFormDefinition(node.parameters?.formDefinition);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.definition.title).toBe('Feedback');
			expect(parsed.definition.page.elements.map((e) => e.label)).toEqual(['Name', 'Rating']);
		}
	});

	it('stamps the default definition when params are missing or invalid', () => {
		const json = workflowWith([
			{
				id: '1',
				name: 'On form submission',
				type: FORM_TRIGGER,
				typeVersion: 2.6,
				position: [0, 0],
				parameters: {},
			},
		]);

		ensureFormV3Definition(json);

		const node = json.nodes[0];
		expect(node.typeVersion).toBe(3);
		const parsed = safeParseFormDefinition(node.parameters?.formDefinition);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.definition.page.elements.length).toBeGreaterThan(0);
		}
	});

	it('keeps an already-valid v3 definition verbatim', () => {
		const definition = JSON.stringify(
			{
				version: 1,
				id: 'kept',
				title: 'Styled form',
				layout: { mode: 'oneAtATime' },
				theme: { colors: { primary: '#ff0000' } },
				page: { id: 'p1', elements: [{ id: 'e1', type: 'text', label: 'Kept' }], logic: [] },
			},
			null,
			2,
		);
		const json = workflowWith([
			{
				id: '1',
				name: 'On form submission',
				type: FORM_TRIGGER,
				typeVersion: 3,
				position: [0, 0],
				parameters: { formDefinition: definition },
			},
		]);

		ensureFormV3Definition(json);

		expect(json.nodes[0].parameters?.formDefinition).toBe(definition);
	});

	it('leaves expression-valued (runtime) definitions untouched', () => {
		const json = workflowWith([
			{
				id: '1',
				name: 'On form submission',
				type: FORM_TRIGGER,
				typeVersion: 2.6,
				position: [0, 0],
				parameters: { formDefinition: '={{ $json.formDefinition }}' },
			},
		]);

		ensureFormV3Definition(json);

		expect(json.nodes[0].typeVersion).toBe(2.6);
		expect(json.nodes[0].parameters?.formDefinition).toBe('={{ $json.formDefinition }}');
	});

	it('forces completion page nodes to v3 without stamping a definition', () => {
		const json = workflowWith([
			{
				id: '1',
				name: 'Form Ending',
				type: FORM_NODE,
				typeVersion: 2.5,
				position: [0, 0],
				parameters: { operation: 'completion' },
			},
		]);

		ensureFormV3Definition(json);

		expect(json.nodes[0].typeVersion).toBe(3);
		expect(json.nodes[0].parameters?.formDefinition).toBeUndefined();
	});

	it('gives chained page nodes the same form id as the trigger', () => {
		const json = workflowWith([
			{
				id: '1',
				name: 'On form submission',
				type: FORM_TRIGGER,
				typeVersion: 2.6,
				position: [0, 0],
				parameters: {
					formFields: { values: [{ fieldLabel: 'Name', fieldType: 'text' }] },
				},
			},
			{
				id: '2',
				name: 'Page 2',
				type: FORM_NODE,
				typeVersion: 2.5,
				position: [200, 0],
				parameters: {
					operation: 'page',
					formFields: { values: [{ fieldLabel: 'Email', fieldType: 'email' }] },
				},
			},
		]);

		ensureFormV3Definition(json);

		const triggerParsed = safeParseFormDefinition(json.nodes[0].parameters?.formDefinition);
		const pageParsed = safeParseFormDefinition(json.nodes[1].parameters?.formDefinition);
		expect(triggerParsed.success && pageParsed.success).toBe(true);
		if (triggerParsed.success && pageParsed.success) {
			expect(pageParsed.definition.id).toBe(triggerParsed.definition.id);
		}
	});
});
