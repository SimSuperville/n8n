vi.mock('fs/promises', async () => ({
	...(await vi.importActual<typeof _fsPromises>('fs/promises')),
	rm: vi.fn(),
}));

import type * as _fsPromises from 'fs/promises';
import { mock } from 'vitest-mock-extended';
import type {
	IDataObject,
	IWebhookFunctions,
	IWorkflowSettings,
	MultiPartFormData,
} from 'n8n-workflow';
import { FORM_TRIGGER_NODE_TYPE, NodeOperationError } from 'n8n-workflow';

import {
	buildPrefill,
	getFormDefinitionV3,
	parseV3SubmissionBody,
	prepareV3ReturnItem,
} from '../v3/utils-v3';

const definitionFixture = {
	version: 1,
	id: 'frm1',
	title: 'Feedback',
	layout: { mode: 'classic' },
	theme: {},
	page: {
		id: 'pg1',
		elements: [
			{ id: 'name', type: 'text', label: 'Name', required: true },
			{ id: 'mail', type: 'email', label: 'Email', required: true },
			{ id: 'age', type: 'number', label: 'Age', config: { min: 18 } },
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
			{ id: 'why', type: 'textarea', label: 'Why' },
			{ id: 'cv', type: 'file', label: 'CV', config: { multiple: false } },
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
	},
};

function mockContext({
	body = {},
	files = {},
	query = {},
	definition = definitionFixture,
}: {
	body?: IDataObject;
	files?: IDataObject;
	query?: IDataObject;
	definition?: unknown;
} = {}) {
	const context = mock<IWebhookFunctions>();
	context.getNode.mockReturnValue({
		id: 'node1',
		name: 'On form submission',
		type: FORM_TRIGGER_NODE_TYPE,
		typeVersion: 3,
		position: [0, 0],
		parameters: {},
	});
	context.getNodeParameter.mockImplementation((name: string, fallback?: unknown) => {
		if (name === 'formDefinition') return definition;
		if (name === 'options.showHeaders') return false;
		return fallback;
	});
	context.getRequestObject.mockReturnValue({
		contentType: 'multipart/form-data',
		method: 'POST',
		query,
		headers: {},
	} as never);
	context.getBodyData.mockReturnValue({ data: body, files });
	context.getWorkflowSettings.mockReturnValue({} as IWorkflowSettings);
	context.getTimezone.mockReturnValue('UTC');
	context.evaluateExpression.mockImplementation((expression) => expression);
	context.nodeHelpers.copyBinaryFile = vi
		.fn()
		.mockResolvedValue({ mimeType: 'application/pdf', fileName: 'cv.pdf', data: 'base64' });
	return context;
}

describe('getFormDefinitionV3', () => {
	it('parses and sanitizes the definition', () => {
		const context = mockContext({
			definition: {
				...definitionFixture,
				description: 'Hello <script>alert(1)</script>world',
				page: {
					id: 'pg1',
					elements: [
						{
							id: 'info',
							type: 'html',
							label: '',
							config: { html: '<p onclick="x()">hi</p><script>bad()</script>' },
						},
					],
					logic: [],
				},
			},
		});
		const definition = getFormDefinitionV3(context);
		expect(definition.description).not.toContain('<script>');
		const html = (definition.page.elements[0].config as { html: string }).html;
		expect(html).toContain('<p>hi</p>');
		expect(html).not.toContain('script');
	});

	it('throws a NodeOperationError for invalid definitions', () => {
		const context = mockContext({ definition: { version: 99 } });
		expect(() => getFormDefinitionV3(context)).toThrowError(NodeOperationError);
	});
});

describe('parseV3SubmissionBody', () => {
	it('maps wire names to element ids and file metadata', () => {
		const file = {
			filepath: '/tmp/x',
			originalFilename: 'cv.pdf',
			newFilename: 'x',
			mimetype: 'application/pdf',
			size: 123,
		} as MultiPartFormData.File;
		const context = mockContext({
			body: { f_name: 'Jane', f_mail: 'jane@acme.com', f_color: 'o2' },
			files: { f_cv: file },
		});
		const definition = getFormDefinitionV3(context);
		const { rawValues, files } = parseV3SubmissionBody(context, definition);
		expect(rawValues.name).toBe('Jane');
		expect(rawValues.color).toBe('o2');
		expect(rawValues.cv).toEqual([{ name: 'cv.pdf', size: 123, mimeType: 'application/pdf' }]);
		expect(files.cv).toHaveLength(1);
	});
});

describe('prepareV3ReturnItem', () => {
	it('returns per-field errors for missing required and invalid values', async () => {
		const context = mockContext({ body: { f_mail: 'nope', f_age: '10' } });
		const definition = getFormDefinitionV3(context);
		const outcome = await prepareV3ReturnItem(context, definition, 'production');
		const errorIds = outcome.errors.map((error) => error.elementId);
		expect(errorIds).toEqual(expect.arrayContaining(['name', 'mail', 'age']));
		expect(outcome.returnItem).toBeUndefined();
	});

	it('rejects tampered dropdown values', async () => {
		const context = mockContext({
			body: { f_name: 'Jane', f_mail: 'jane@acme.com', f_color: 'not-an-option' },
		});
		const definition = getFormDefinitionV3(context);
		const outcome = await prepareV3ReturnItem(context, definition, 'production');
		expect(outcome.errors.map((error) => error.elementId)).toContain('color');
	});

	it('builds the output item keyed by label, discarding logic-hidden values', async () => {
		const context = mockContext({
			body: {
				f_name: ' Jane ',
				f_mail: 'jane@acme.com',
				f_age: '42',
				f_color: 'o2',
				f_why: 'should be dropped',
			},
		});
		const definition = getFormDefinitionV3(context);
		const outcome = await prepareV3ReturnItem(context, definition, 'production');
		expect(outcome.errors).toEqual([]);
		expect(outcome.returnItem?.json).toMatchObject({
			Name: 'Jane',
			Email: 'jane@acme.com',
			Age: 42,
			Color: 'Blue',
			formMode: 'production',
		});
		expect(outcome.returnItem?.json).not.toHaveProperty('Why');
		expect(outcome.returnItem?.json.submittedAt).toBeDefined();
	});

	it('copies uploaded files into binary properties', async () => {
		const file = {
			filepath: '/tmp/x',
			originalFilename: 'cv.pdf',
			newFilename: 'x',
			mimetype: 'application/pdf',
			size: 123,
		} as MultiPartFormData.File;
		const context = mockContext({
			body: { f_name: 'Jane', f_mail: 'jane@acme.com' },
			files: { f_cv: file },
		});
		const definition = getFormDefinitionV3(context);
		const outcome = await prepareV3ReturnItem(context, definition, 'production');
		expect(outcome.errors).toEqual([]);
		expect(outcome.returnItem?.binary).toHaveProperty('CV');
		expect(outcome.returnItem?.json.CV).toMatchObject({ filename: 'cv.pdf', size: 123 });
	});
});

describe('buildPrefill', () => {
	it('matches query params by output key and element id', () => {
		const context = mockContext();
		const definition = getFormDefinitionV3(context);
		const prefill = buildPrefill(definition, { Name: 'Jane', age: '30', unrelated: 'x' });
		expect(prefill).toEqual({ name: 'Jane', age: '30' });
	});

	it('returns undefined when nothing matches', () => {
		const context = mockContext();
		const definition = getFormDefinitionV3(context);
		expect(buildPrefill(definition, { unrelated: 'x' })).toBeUndefined();
	});
});
