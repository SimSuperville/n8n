import type { Response } from 'express';
import type {
	IUser,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeTypeAndVersion,
} from 'n8n-workflow';

import { renderFormCompletion } from '../utils/formCompletionUtils';
import { generateFormUserAuthToken, getNodeReference, sanitizeHtml } from '../utils/utils';
import {
	buildN8nWebsiteLink,
	buildPrefill,
	getFormDefinitionV3,
	getTriggerDefinitionSettings,
	prepareV3ReturnItem,
	respondWithPayloadV3,
	type FormCompletionPayloadV3,
	type FormPagePayloadV3,
} from './utils-v3';

/** GET of a v3 form page node: next page payload (JSON for the SPA, shim for navigations) */
export async function renderFormNodeV3(
	context: IWebhookFunctions,
	res: Response,
	trigger: NodeTypeAndVersion,
	mode: 'test' | 'production',
	authedUser?: IUser,
): Promise<IWebhookResponseData> {
	const definition = getFormDefinitionV3(context);

	// Pages inherit the trigger's theme and layout
	const triggerSettings = getTriggerDefinitionSettings(context, trigger.name);
	if (triggerSettings !== undefined) {
		definition.theme = { ...triggerSettings.theme, ...definition.theme };
		definition.layout = triggerSettings.layout;
	}

	const options = context.getNodeParameter('options', {}) as {
		buttonLabel?: string;
	};

	const triggerRef = getNodeReference(trigger.name);
	let prefillQuery: Record<string, string> | undefined;
	try {
		prefillQuery = context.evaluateExpression(
			`{{ ${triggerRef}.first().json.formQueryParameters }}`,
		) as Record<string, string> | undefined;
	} catch {
		prefillQuery = undefined;
	}

	const appendAttribution = context.evaluateExpression(
		`{{ ${triggerRef}.params.options?.appendAttribution === false ? false : true }}`,
	) as boolean;

	const authToken = authedUser
		? generateFormUserAuthToken(context.getNode(), authedUser)
		: undefined;

	const payload: FormPagePayloadV3 = {
		kind: 'page',
		formDefinition: definition,
		submitUrl: context.getRequestObject().originalUrl,
		buttonLabel: options.buttonLabel ?? 'Submit',
		appendAttribution,
		n8nWebsiteLink: buildN8nWebsiteLink(context.getInstanceId()),
		testRun: mode === 'test',
		prefill: buildPrefill(definition, prefillQuery),
		authToken,
	};

	respondWithPayloadV3(context, res, payload);
	return { noWebhookResponse: true };
}

/** POST of a v3 form page node: validate server-side, 400 on errors, else resume */
export async function handleFormPageSubmissionV3(
	context: IWebhookFunctions,
	res: Response,
	mode: 'test' | 'production',
	useWorkflowTimezone: boolean,
	authedUser?: IUser,
): Promise<IWebhookResponseData> {
	const definition = getFormDefinitionV3(context);

	const outcome = await prepareV3ReturnItem(
		context,
		definition,
		mode,
		useWorkflowTimezone,
		authedUser,
	);

	if (outcome.errors.length > 0) {
		res.status(400).json({ status: 'error', errors: outcome.errors });
		return { noWebhookResponse: true };
	}

	return {
		webhookResponse: { status: 200 },
		workflowData: [[outcome.returnItem!]],
	};
}

/**
 * GET of a v3 completion node. Text/redirect endings answer as payloads
 * (JSON or SPA shim); showText and returnBinary keep the legacy rendering,
 * which streams raw HTML or binary data.
 */
export async function renderFormCompletionV3(
	context: IWebhookFunctions,
	res: Response,
	trigger: NodeTypeAndVersion,
	authedUser?: IUser,
): Promise<IWebhookResponseData> {
	const respondWith = context.getNodeParameter('respondWith', '') as string;

	if (respondWith === 'showText' || respondWith === 'returnBinary') {
		return await renderFormCompletion(context, res, trigger, authedUser);
	}

	const payload: FormCompletionPayloadV3 = { kind: 'completion' };

	if (respondWith === 'redirect') {
		payload.redirectUrl = context.getNodeParameter('redirectUrl', '') as string;
	} else {
		const title = context.getNodeParameter('completionTitle', '') as string;
		const message = context.getNodeParameter('completionMessage', '') as string;
		if (title) payload.title = sanitizeHtml(title);
		if (message) payload.message = sanitizeHtml(message);
	}

	respondWithPayloadV3(context, res, payload);
	return { noWebhookResponse: true };
}
