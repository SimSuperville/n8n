import { createApp } from 'vue';

import App from './App.vue';
import { FORM_DEFINITION_SCRIPT_ID, type FormBootPayload } from './types';

export interface CreateFormAppOptions {
	/** Element (or selector) to mount into; defaults to '#n8n-form' */
	target?: string | Element;
	/** Boot payload; defaults to the JSON script tag the server injects */
	payload?: FormBootPayload;
}

function readInjectedPayload(): FormBootPayload {
	const script = document.getElementById(FORM_DEFINITION_SCRIPT_ID);
	if (script === null) {
		throw new Error(`Missing #${FORM_DEFINITION_SCRIPT_ID} payload script tag`);
	}
	try {
		return JSON.parse(script.textContent ?? '{}') as FormBootPayload;
	} catch {
		throw new Error('The injected form payload is not valid JSON');
	}
}

export function createFormApp(options: CreateFormAppOptions = {}) {
	const payload = options.payload ?? readInjectedPayload();
	const target = options.target ?? '#n8n-form';
	const app = createApp(App, { payload });
	app.mount(target);
	return app;
}
