import {
	getElementKey,
	getElementWireName,
	getFieldType,
	parseFormDefinition,
	validateSubmission,
	type FormDefinition,
	type FormValues,
	type SubmissionError,
} from '@n8n/form-core';
import type { Response } from 'express';
import { rm } from 'fs/promises';
import { DateTime } from 'luxon';
import { getHtmlSandboxCSP, isFormHtmlSandboxingDisabled } from 'n8n-core';
import type {
	IDataObject,
	INodeExecutionData,
	IUser,
	IWebhookFunctions,
	MultiPartFormData,
} from 'n8n-workflow';
import { BINARY_MODE_COMBINED, FORM_TRIGGER_NODE_TYPE, NodeOperationError } from 'n8n-workflow';
import * as a from 'node:assert';

import { getResolvables } from '../../../utils/utilities';
import { getNodeReference, handleNewlines, sanitizeCustomCss, sanitizeHtml } from '../utils/utils';

export const FORM_RENDERER_TEMPLATE = 'form-renderer';

/** Boot payload shape shared with @n8n/forms (structural copy; renderer owns the contract) */
export interface FormPagePayloadV3 {
	kind: 'page';
	formDefinition: FormDefinition;
	submitUrl: string;
	buttonLabel?: string;
	appendAttribution?: boolean;
	n8nWebsiteLink?: string;
	testRun?: boolean;
	prefill?: Record<string, string>;
	authToken?: string;
}

export interface FormCompletionPayloadV3 {
	kind: 'completion';
	title?: string;
	message?: string;
	redirectUrl?: string;
}

/**
 * Reads and validates the node's formDefinition parameter, resolves expressions
 * inside html blocks, and sanitizes author-provided rich content.
 */
export function getFormDefinitionV3(
	context: IWebhookFunctions,
	parameterName = 'formDefinition',
): FormDefinition {
	const raw = context.getNodeParameter(parameterName, {});
	let definition: FormDefinition;
	try {
		definition = parseFormDefinition(raw);
	} catch (error) {
		throw new NodeOperationError(context.getNode(), error as Error, {
			message: 'The form definition is invalid',
		});
	}

	definition = structuredClone(definition);

	if (definition.description !== undefined) {
		definition.description = handleNewlines(sanitizeHtml(definition.description));
	}
	if (definition.theme.customCss !== undefined) {
		definition.theme.customCss = sanitizeCustomCss(definition.theme.customCss);
	}
	for (const element of definition.page.elements) {
		if (element.type !== 'html') continue;
		const config = (element.config ?? {}) as { html?: string };
		let html = config.html ?? '';
		for (const resolvable of getResolvables(html)) {
			html = html.replace(resolvable, context.evaluateExpression(resolvable) as string);
		}
		element.config = { ...element.config, html: sanitizeHtml(html) };
	}

	return definition;
}

/** Reads the trigger's formDefinition to inherit theme/layout on chained page nodes */
export function getTriggerDefinitionSettings(
	context: IWebhookFunctions,
	triggerNodeName: string,
): Pick<FormDefinition, 'theme' | 'layout'> | undefined {
	try {
		const triggerRef = getNodeReference(triggerNodeName);
		const raw = context.evaluateExpression(`{{ ${triggerRef}.params.formDefinition }}`);
		if (raw === undefined || raw === null) return undefined;
		const definition = parseFormDefinition(raw);
		return { theme: definition.theme, layout: definition.layout };
	} catch {
		return undefined;
	}
}

export function buildPrefill(
	definition: FormDefinition,
	query: IDataObject | undefined,
): Record<string, string> | undefined {
	if (query === undefined || Object.keys(query).length === 0) return undefined;
	const prefill: Record<string, string> = {};
	for (const element of definition.page.elements) {
		const byKey = query[getElementKey(element)] ?? query[element.id];
		if (byKey !== undefined && typeof byKey === 'string') {
			prefill[element.id] = byKey;
		}
	}
	return Object.keys(prefill).length > 0 ? prefill : undefined;
}

export function buildN8nWebsiteLink(instanceId: string | undefined): string {
	const utmCampaign = instanceId ? `&utm_campaign=${instanceId}` : '';
	return `https://n8n.io/?utm_source=n8n-internal&utm_medium=form-trigger${utmCampaign}`;
}

function wantsJson(context: IWebhookFunctions): boolean {
	const accept = context.getRequestObject().headers.accept ?? '';
	return accept.includes('application/json');
}

function applySandboxCsp(res: Response): void {
	if (!isFormHtmlSandboxingDisabled()) {
		res.setHeader('Content-Security-Policy', getHtmlSandboxCSP());
	}
}

/**
 * Responds with the page payload: JSON for the SPA's fetches,
 * the SPA shim page for browser navigations.
 */
export function respondWithPayloadV3(
	context: IWebhookFunctions,
	res: Response,
	payload: FormPagePayloadV3 | FormCompletionPayloadV3,
): void {
	if (wantsJson(context)) {
		res.json(payload);
		return;
	}
	applySandboxCsp(res);
	res.render(FORM_RENDERER_TEMPLATE, {
		formPayloadJson: JSON.stringify(payload).replaceAll('</', '<\\/'),
	});
}

export interface V3SubmissionParseResult {
	rawValues: FormValues;
	files: Record<string, MultiPartFormData.File[]>;
}

/** Maps the multipart body (wire names f_<elementId>) back to element ids */
export function parseV3SubmissionBody(
	context: IWebhookFunctions,
	definition: FormDefinition,
): V3SubmissionParseResult {
	const req = context.getRequestObject() as MultiPartFormData.Request;
	a.ok(req.contentType === 'multipart/form-data', 'Expected multipart/form-data');
	const bodyData = (context.getBodyData().data as IDataObject) ?? {};
	const bodyFiles = (context.getBodyData().files as IDataObject) ?? {};

	const rawValues: FormValues = {};
	const files: Record<string, MultiPartFormData.File[]> = {};

	for (const element of definition.page.elements) {
		const wireName = getElementWireName(element);
		const fileValue = bodyFiles[wireName] as
			| MultiPartFormData.File
			| MultiPartFormData.File[]
			| undefined;
		if (fileValue !== undefined) {
			const list = Array.isArray(fileValue) ? fileValue : [fileValue];
			files[element.id] = list;
			rawValues[element.id] = list.map((file) => ({
				name: file.originalFilename ?? file.newFilename,
				size: file.size,
				mimeType: file.mimetype ?? 'application/octet-stream',
			}));
			continue;
		}
		const value = bodyData[wireName];
		if (value !== undefined) rawValues[element.id] = value;
	}

	return { rawValues, files };
}

export interface V3SubmissionOutcome {
	errors: SubmissionError[];
	returnItem?: INodeExecutionData;
}

/**
 * Validates the submission server-side (required, types, option membership,
 * logic-hidden values discarded) and builds the output item on success.
 */
export async function prepareV3ReturnItem(
	context: IWebhookFunctions,
	definition: FormDefinition,
	mode: 'test' | 'production',
	useWorkflowTimezone = false,
	authedUser?: IUser,
): Promise<V3SubmissionOutcome> {
	const { rawValues, files } = parseV3SubmissionBody(context, definition);
	const result = validateSubmission(definition.page, rawValues);

	if (result.errors.length > 0) {
		await cleanupTempFiles(files);
		return { errors: result.errors };
	}

	const { binaryMode } = context.getWorkflowSettings();
	const returnItem: INodeExecutionData = { json: {} };

	for (const element of definition.page.elements) {
		const key = getElementKey(element);
		const value = result.values[key];
		if (value === undefined) continue;

		if (element.type === 'date') {
			const format = (element.config as { format?: string } | undefined)?.format;
			if (format !== undefined && typeof value === 'string') {
				const parsed = DateTime.fromFormat(value, 'yyyy-MM-dd');
				returnItem.json[key] = parsed.isValid ? parsed.toFormat(format) : value;
				continue;
			}
		}

		if (element.type === 'file') {
			continue; // handled below with binary copy
		}

		returnItem.json[key] = value as IDataObject[keyof IDataObject];
	}

	for (const element of definition.page.elements) {
		const elementFiles = files[element.id];
		if (elementFiles === undefined || result.hiddenElementIds.includes(element.id)) {
			if (elementFiles !== undefined) await cleanupTempFiles({ [element.id]: elementFiles });
			continue;
		}
		const key = getElementKey(element);
		const multiple =
			(element.config as { multiple?: boolean } | undefined)?.multiple === true ||
			elementFiles.length > 1;

		returnItem.binary ??= {};
		const combined: IDataObject[] = [];
		const metadata: IDataObject[] = [];
		let fileCount = 0;
		for (const file of elementFiles) {
			const binaryData = await context.nodeHelpers.copyBinaryFile(
				file.filepath,
				file.originalFilename ?? file.newFilename,
				file.mimetype,
			);
			if (binaryMode === BINARY_MODE_COMBINED) {
				combined.push(binaryData as unknown as IDataObject);
			} else {
				let binaryPropertyName = key.replace(/\W/g, '_');
				if (multiple) binaryPropertyName += `_${fileCount++}`;
				returnItem.binary[binaryPropertyName] = binaryData;
				metadata.push({
					filename: file.originalFilename ?? file.newFilename,
					mimetype: file.mimetype,
					size: file.size,
				});
			}
			await rm(file.filepath, { force: true });
		}
		if (binaryMode === BINARY_MODE_COMBINED) {
			returnItem.json[key] = multiple ? combined : combined[0];
		} else {
			returnItem.json[key] = multiple ? metadata : metadata[0];
		}
		if (Object.keys(returnItem.binary).length === 0) delete returnItem.binary;
	}

	const timezone = useWorkflowTimezone ? context.getTimezone() : 'UTC';
	returnItem.json.submittedAt = DateTime.now().setZone(timezone).toISO();
	returnItem.json.formMode = mode;

	if (context.getNodeParameter('options.showHeaders', false)) {
		returnItem.json.headers = context.getHeaderData();
	}

	if (
		context.getNode().type === FORM_TRIGGER_NODE_TYPE &&
		Object.keys(context.getRequestObject().query || {}).length
	) {
		returnItem.json.formQueryParameters = context.getRequestObject().query;
	}

	if (authedUser) {
		returnItem.json.user = {
			id: authedUser.id,
			email: authedUser.email,
			firstName: authedUser.firstName,
			lastName: authedUser.lastName,
		};
	}

	return { errors: [], returnItem };
}

async function cleanupTempFiles(files: Record<string, MultiPartFormData.File[]>): Promise<void> {
	for (const list of Object.values(files)) {
		for (const file of list) {
			await rm(file.filepath, { force: true });
		}
	}
}

/** Ensures every element type in the definition exists in the registry */
export function assertKnownFieldTypes(
	context: IWebhookFunctions,
	definition: FormDefinition,
): void {
	for (const element of definition.page.elements) {
		if (getFieldType(element.type) === undefined) {
			throw new NodeOperationError(context.getNode(), `Unknown form field type "${element.type}"`);
		}
	}
}
