import type { IUser, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import isbot from 'isbot';

import { WebhookAuthorizationError } from '../../Webhook/error';
import {
	generateFormPostBasicAuthToken,
	isIpAllowed,
	validateWebhookAuthentication,
} from '../../Webhook/utils';
import { FORM_TRIGGER_AUTHENTICATION_PROPERTY } from '../interfaces';
import {
	authenticateFormUserOrRespond,
	generateFormUserAuthToken,
	isFormConnected,
	validateResponseModeConfiguration,
} from '../utils/utils';
import {
	buildN8nWebsiteLink,
	buildPrefill,
	getFormDefinitionV3,
	prepareV3ReturnItem,
	respondWithPayloadV3,
	type FormPagePayloadV3,
} from './utils-v3';

interface FormTriggerV3Options {
	ignoreBots?: boolean;
	ipWhitelist?: string;
	useWorkflowTimezone?: boolean;
	appendAttribution?: boolean;
	buttonLabel?: string;
	includeUserInOutput?: boolean;
	respondWithOptions?: {
		values: {
			respondWith: 'text' | 'redirect';
			formSubmittedText: string;
			redirectUrl: string;
		};
	};
}

export async function formWebhookV3(context: IWebhookFunctions): Promise<IWebhookResponseData> {
	const node = context.getNode();
	const options = context.getNodeParameter('options', {}) as FormTriggerV3Options;
	const res = context.getResponseObject();
	const req = context.getRequestObject();

	if (!isIpAllowed(options.ipWhitelist, req.ips, req.ip)) {
		res.writeHead(403);
		res.end('IP is not allowed to access this form!');
		return { noWebhookResponse: true };
	}

	if (options.ignoreBots && isbot(req.headers['user-agent'])) {
		res.setHeader('WWW-Authenticate', 'Basic realm="Enter credentials"');
		res.status(401).send();
		return { noWebhookResponse: true };
	}

	const authentication = context.getNodeParameter(
		FORM_TRIGGER_AUTHENTICATION_PROPERTY,
		'none',
	) as string;
	let authedUser: IUser | undefined;
	if (authentication === 'n8nUserAuth') {
		const { user } = (await authenticateFormUserOrRespond(context, false)) ?? {};
		if (!user) return { noWebhookResponse: true };
		authedUser = user;
	} else {
		try {
			await validateWebhookAuthentication(context, FORM_TRIGGER_AUTHENTICATION_PROPERTY);
		} catch (error) {
			if (error instanceof WebhookAuthorizationError) {
				res.setHeader('WWW-Authenticate', 'Basic realm="Enter credentials"');
				res.status(401).send();
				return { noWebhookResponse: true };
			}
			throw error;
		}
	}

	const mode = context.getMode() === 'manual' ? 'test' : 'production';
	const definition = getFormDefinitionV3(context);

	validateResponseModeConfiguration(context);

	if (req.method === 'GET') {
		let authToken: string | undefined;
		if (authentication === 'n8nUserAuth' && authedUser) {
			authToken = generateFormUserAuthToken(node, authedUser);
		} else {
			authToken = await generateFormPostBasicAuthToken(
				context,
				FORM_TRIGGER_AUTHENTICATION_PROPERTY,
			);
		}

		const payload: FormPagePayloadV3 = {
			kind: 'page',
			formDefinition: definition,
			submitUrl: req.originalUrl,
			buttonLabel: options.buttonLabel ?? 'Submit',
			appendAttribution: options.appendAttribution !== false,
			n8nWebsiteLink: buildN8nWebsiteLink(context.getInstanceId()),
			testRun: mode === 'test',
			prefill: buildPrefill(definition, req.query as Record<string, string>),
			authToken,
		};

		respondWithPayloadV3(context, res, payload);
		return { noWebhookResponse: true };
	}

	// POST: server-side validation, then hand the submission to the workflow
	const useWorkflowTimezone = options.useWorkflowTimezone !== false;
	const userForOutput = options.includeUserInOutput === false ? undefined : authedUser;

	const outcome = await prepareV3ReturnItem(
		context,
		definition,
		mode,
		useWorkflowTimezone,
		userForOutput,
	);

	if (outcome.errors.length > 0) {
		res.status(400).json({ status: 'error', errors: outcome.errors });
		return { noWebhookResponse: true };
	}

	// Single-page forms (no chained pages) respond with the completion payload directly;
	// multi-page executions are answered by webhook-helpers' 'formPage' mode instead.
	const connectedNodes = context.getChildNodes(node.name, { includeNodeParameters: true });
	const hasNextPage = isFormConnected(connectedNodes);

	let webhookResponse: Record<string, unknown> = { status: 'completed' };
	if (!hasNextPage) {
		const respondValues = options.respondWithOptions?.values;
		if (respondValues?.respondWith === 'redirect') {
			webhookResponse = {
				status: 'completed',
				completion: { redirectUrl: respondValues.redirectUrl },
			};
		} else if (respondValues?.respondWith === 'text' && respondValues.formSubmittedText) {
			webhookResponse = {
				status: 'completed',
				completion: { message: respondValues.formSubmittedText },
			};
		}
	}

	return {
		webhookResponse,
		workflowData: [[outcome.returnItem!]],
	};
}
