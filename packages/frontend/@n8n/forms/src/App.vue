<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';

import FormRenderer from './components/FormRenderer.vue';
import type { FormRuntime } from './composables/useFormRuntime';
import {
	EXECUTION_STATUS_SUFFIX,
	FORM_AUTH_HEADER,
	type FormBootPayload,
	type FormCompletionPayload,
	type FormPagePayload,
	type FormSubmitResponse,
} from './types';

const props = defineProps<{
	payload: FormBootPayload;
}>();

const page = ref<FormPagePayload | null>(props.payload.kind === 'page' ? props.payload : null);
const completion = ref<FormCompletionPayload | null>(
	props.payload.kind === 'completion' ? props.payload : null,
);
const submitting = ref(false);
const fatalError = ref<string | null>(null);
const serverFieldErrors = ref<Array<{ elementId: string; message: string }>>([]);
const transitionKey = ref(0);

// shallowRef keeps the nested Refs' types intact (no UnwrapRef on exposed runtime)
const rendererRef = shallowRef<{ runtime?: FormRuntime } | null>(null);

const definition = computed(() => page.value?.formDefinition ?? null);

function authHeaders(): Record<string, string> {
	const token = page.value?.authToken;
	return token !== undefined && token !== '' ? { [FORM_AUTH_HEADER]: token } : {};
}

async function submit(formData: FormData) {
	if (page.value === null) return;
	submitting.value = true;
	serverFieldErrors.value = [];
	try {
		const response = await fetch(page.value.submitUrl, {
			method: 'POST',
			headers: { accept: 'application/json', ...authHeaders() },
			body: formData,
		});
		await handleSubmitResponse(response);
	} catch {
		fatalError.value = 'Something went wrong while submitting. Try again.';
	} finally {
		submitting.value = false;
	}
}

async function handleSubmitResponse(response: Response) {
	if (response.status === 413) {
		fatalError.value = 'The submitted data is too large.';
		return;
	}
	let parsed: unknown;
	try {
		parsed = await response.json();
	} catch {
		if (response.ok) {
			completion.value = { kind: 'completion' };
			page.value = null;
			return;
		}
		fatalError.value = 'Something went wrong while submitting. Try again.';
		return;
	}

	let body = parsed as FormSubmitResponse;
	// Multi-page executions respond { formWaitingUrl } (webhook-helpers 'formPage' mode)
	const raw = parsed as { status?: string; formWaitingUrl?: string };
	if (raw.status === undefined && typeof raw.formWaitingUrl === 'string') {
		body = { status: 'pending', formWaitingUrl: raw.formWaitingUrl };
	}

	if (body.status === 'error') {
		serverFieldErrors.value = body.errors ?? [];
		applyServerErrors();
		return;
	}
	if (!response.ok) {
		fatalError.value = 'Something went wrong while submitting. Try again.';
		return;
	}
	if (body.status === 'redirect') {
		window.location.replace(body.redirectUrl);
		return;
	}
	if (body.status === 'completed') {
		if (body.completion?.redirectUrl !== undefined) {
			window.location.replace(body.completion.redirectUrl);
			return;
		}
		completion.value = { kind: 'completion', ...body.completion };
		page.value = null;
		return;
	}
	if (body.status === 'pending') {
		await waitForNextStep(body.formWaitingUrl);
	}
}

async function waitForNextStep(formWaitingUrl: string) {
	// The waiting URL may carry a resume token in its query; keep it intact
	const statusUrl = new URL(formWaitingUrl, window.location.origin);
	statusUrl.pathname = `${statusUrl.pathname.replace(/\/$/, '')}/${EXECUTION_STATUS_SUFFIX}`;
	let delay = 1000;
	for (let attempt = 0; attempt < 60; attempt++) {
		await sleep(delay);
		delay = Math.min(delay * 1.1, 5000);
		let status: string;
		try {
			// The status endpoint responds with the plain status string
			const response = await fetch(statusUrl.toString(), { headers: { accept: 'text/plain' } });
			status = (await response.text()).trim().replace(/^"|"$/g, '');
		} catch {
			continue;
		}
		if (status === 'form-waiting') {
			await loadNextPage(formWaitingUrl);
			return;
		}
		if (status === 'success') {
			await loadCompletion(formWaitingUrl);
			return;
		}
		if (['error', 'crashed', 'canceled'].includes(status)) {
			fatalError.value = 'The workflow execution failed. Contact the form owner.';
			return;
		}
	}
	fatalError.value = 'Timed out waiting for the next step. Reload the page to continue.';
}

async function loadNextPage(formWaitingUrl: string) {
	const response = await fetch(formWaitingUrl, {
		headers: { accept: 'application/json', ...authHeaders() },
	});
	if (!response.ok) {
		fatalError.value = 'Could not load the next page. Reload to try again.';
		return;
	}
	const payload = (await response.json()) as FormBootPayload;
	applyPayload(payload);
}

async function loadCompletion(formWaitingUrl: string) {
	try {
		const response = await fetch(formWaitingUrl, {
			headers: { accept: 'application/json', ...authHeaders() },
		});
		if (response.ok) {
			const payload = (await response.json()) as FormBootPayload;
			applyPayload(payload);
			return;
		}
	} catch {
		// fall through to the generic completion screen
	}
	completion.value = { kind: 'completion' };
	page.value = null;
}

function applyPayload(payload: FormBootPayload) {
	if (payload.kind === 'completion') {
		if (payload.redirectUrl !== undefined && payload.redirectUrl !== '') {
			window.location.replace(payload.redirectUrl);
			return;
		}
		completion.value = payload;
		page.value = null;
		return;
	}
	page.value = payload;
	completion.value = null;
	transitionKey.value += 1;
	window.scrollTo({ top: 0 });
}

function applyServerErrors() {
	const runtime = rendererRef.value?.runtime;
	if (runtime === undefined) return;
	const merged: Record<string, string> = {};
	for (const [elementId, message] of Object.entries(runtime.errors.value)) {
		merged[elementId] = message;
	}
	for (const error of serverFieldErrors.value) {
		merged[error.elementId] = error.message;
	}
	runtime.errors.value = merged;
}

// eslint-disable-next-line n8n-local-rules/no-restricted-sleep-definition -- the public form bundle stays dependency-free
async function sleep(ms: number): Promise<void> {
	return await new Promise((resolve) => setTimeout(resolve, ms));
}
</script>

<template>
	<div class="n8n-form-app">
		<div v-if="fatalError" class="n8n-form-root">
			<div class="n8n-form-card" role="alert">
				<h1 class="n8n-form-title">Something went wrong</h1>
				<p class="n8n-form-subtitle">{{ fatalError }}</p>
			</div>
		</div>

		<div v-else-if="completion" class="n8n-form-root">
			<div class="n8n-form-card n8n-form-completion">
				<div class="n8n-form-completion-icon" aria-hidden="true">✓</div>
				<h1 class="n8n-form-title">{{ completion.title ?? 'Form submitted' }}</h1>
				<p class="n8n-form-subtitle">
					{{ completion.message ?? 'Your response has been recorded.' }}
				</p>
			</div>
		</div>

		<Transition v-else-if="definition && page" name="n8n-form-page" mode="out-in">
			<FormRenderer
				:key="transitionKey"
				ref="rendererRef"
				:definition="definition"
				:button-label="page.buttonLabel"
				:append-attribution="page.appendAttribution"
				:n8n-website-link="page.n8nWebsiteLink"
				:prefill="page.prefill"
				:submitting="submitting"
				@submit="submit"
			/>
		</Transition>
	</div>
</template>

<style>
.n8n-form-app {
	min-height: 100vh;
}

.n8n-form-app .n8n-form-root {
	min-height: 100vh;
}

.n8n-form-completion {
	text-align: center;
}

.n8n-form-completion-icon {
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: var(--n8n-form-color-primary, #ff6d5a);
	color: #ffffff;
	font-size: 24px;
	line-height: 48px;
	margin: 0 auto 16px;
}

.n8n-form-page-enter-active,
.n8n-form-page-leave-active {
	transition:
		opacity 0.22s ease,
		transform 0.22s ease;
}

.n8n-form-page-enter-from {
	opacity: 0;
	transform: translateY(16px);
}

.n8n-form-page-leave-to {
	opacity: 0;
	transform: translateY(-16px);
}
</style>
