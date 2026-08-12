import type { INodeProperties } from 'n8n-workflow';

export const DEFAULT_FORM_DEFINITION = {
	version: 1,
	id: 'form',
	title: 'Contact us',
	description: "We'll get back to you soon",
	layout: { mode: 'classic' },
	theme: {},
	page: {
		id: 'page-1',
		elements: [
			{ id: 'name', type: 'text', label: 'Name', required: true, placeholder: 'Jane Doe' },
			{
				id: 'email',
				type: 'email',
				label: 'Email',
				required: true,
				placeholder: 'jane@example.com',
			},
			{ id: 'message', type: 'textarea', label: 'Message' },
		],
		logic: [],
	},
};

/**
 * The v3 form definition parameter. Stored as JSON in node parameters so the
 * workflow JSON stays the source of truth; validated by @n8n/form-core on render
 * and submission. The visual form builder reads and writes this value.
 */
export const formDefinitionProperty: INodeProperties = {
	displayName: 'Form Definition',
	name: 'formDefinition',
	type: 'json',
	typeOptions: {
		rows: 10,
	},
	default: JSON.stringify(DEFAULT_FORM_DEFINITION, null, 2),
	description:
		'The form definition (fields, logic, layout, and theme) as JSON. Use the form builder for a visual editing experience.',
};
