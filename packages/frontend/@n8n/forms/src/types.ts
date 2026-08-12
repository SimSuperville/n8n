import type { FormDefinition } from '@n8n/form-core';

/** Payload the server injects into the shim page / returns for JSON page requests */
export interface FormPagePayload {
	kind: 'page';
	formDefinition: FormDefinition;
	/** Absolute or relative URL the page's submission is POSTed to */
	submitUrl: string;
	buttonLabel?: string;
	appendAttribution?: boolean;
	n8nWebsiteLink?: string;
	testRun?: boolean;
	/** Prefill values keyed by element id (from query parameters) */
	prefill?: Record<string, string>;
	/** Auth token echoed back as x-n8n-form-auth header (page runs on a null origin, no cookies) */
	authToken?: string;
}

export interface FormCompletionPayload {
	kind: 'completion';
	title?: string;
	message?: string;
	redirectUrl?: string;
}

export type FormBootPayload = FormPagePayload | FormCompletionPayload;

/** JSON responses of a v3 form POST */
export type FormSubmitResponse =
	| { status: 'completed'; completion?: Omit<FormCompletionPayload, 'kind'> }
	| { status: 'pending'; formWaitingUrl: string }
	| { status: 'redirect'; redirectUrl: string }
	| { status: 'error'; errors: Array<{ elementId: string; message: string }> };

/** Poll body of GET <formWaitingUrl>/n8n-execution-status */
export interface ExecutionStatusResponse {
	status: string;
}

export const FORM_DEFINITION_SCRIPT_ID = 'n8n-form-payload';
/** dataTransfer MIME the builder palette uses to drag a new field type into the preview */
export const FORM_FIELD_TYPE_MIME = 'application/x-n8n-form-field-type';
export const EXECUTION_STATUS_SUFFIX = 'n8n-execution-status';
export const FORM_AUTH_HEADER = 'x-n8n-form-auth';
