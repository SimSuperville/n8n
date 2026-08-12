<script setup lang="ts">
import type { FormDefinition } from '@n8n/form-core';
import { computed, ref, toRef, nextTick } from 'vue';

import FieldControl from './FieldControl.vue';
import { useFormRuntime } from '../composables/useFormRuntime';

const props = withDefaults(
	defineProps<{
		definition: FormDefinition;
		buttonLabel?: string;
		appendAttribution?: boolean;
		n8nWebsiteLink?: string;
		prefill?: Record<string, string>;
		submitting?: boolean;
		/** 'preview' disables real submission side effects (builder canvas) */
		mode?: 'live' | 'preview';
		/** Builder preview: id of the currently selected element */
		selectedElementId?: string | null;
	}>(),
	{
		buttonLabel: 'Submit',
		appendAttribution: true,
		mode: 'live',
		selectedElementId: null,
	},
);

const emit = defineEmits<{
	submit: [formData: FormData];
	elementSelect: [elementId: string];
}>();

const runtime = useFormRuntime({
	definition: toRef(props, 'definition'),
	prefill: toRef(props, 'prefill'),
});

const summaryElement = ref<HTMLElement | null>(null);

const errorEntries = computed(() =>
	props.definition.page.elements
		.filter((element) => runtime.errors.value[element.id] !== undefined)
		.map((element) => ({
			id: element.id,
			label: element.label,
			message: runtime.errors.value[element.id],
		})),
);

const radiusValue = computed(() => {
	switch (props.definition.theme.radius) {
		case 'none':
			return '0';
		case 'sm':
			return '4px';
		case 'lg':
			return '12px';
		case 'pill':
			return '16px';
		default:
			return '8px';
	}
});

const containerWidth = computed(() => {
	switch (props.definition.layout.containerWidth) {
		case 'narrow':
			return '400px';
		case 'wide':
			return '640px';
		default:
			return '480px';
	}
});

const themeVars = computed(() => {
	const { theme } = props.definition;
	/* eslint-disable @typescript-eslint/naming-convention -- CSS custom property names */
	const vars: Record<string, string> = {
		'--n8n-form-radius': radiusValue.value,
		'--n8n-form-container-width': containerWidth.value,
	};
	/* eslint-enable @typescript-eslint/naming-convention */
	if (theme.colors?.primary) vars['--n8n-form-color-primary'] = theme.colors.primary;
	if (theme.colors?.background) vars['--n8n-form-color-background'] = theme.colors.background;
	if (theme.colors?.surface) vars['--n8n-form-color-surface'] = theme.colors.surface;
	if (theme.colors?.text) vars['--n8n-form-color-text'] = theme.colors.text;
	if (theme.colors?.error) vars['--n8n-form-color-error'] = theme.colors.error;
	if (theme.font?.family) vars['--n8n-form-font-family'] = theme.font.family;
	if (theme.font?.headingFamily) vars['--n8n-form-font-heading'] = theme.font.headingFamily;
	return vars;
});

// In the builder preview, hidden fields stay visible so they can be selected;
// logic-hidden elements still disappear to keep the logic testable live.
const previewElements = computed(() =>
	props.mode === 'preview'
		? props.definition.page.elements.filter(
				(element) => !runtime.hiddenElementIds.value.has(element.id),
			)
		: runtime.visibleElements.value,
);

async function onSubmit() {
	if (props.submitting) return;
	if (props.mode === 'preview') return;
	if (!runtime.validate()) {
		await nextTick();
		summaryElement.value?.focus();
		return;
	}
	emit('submit', runtime.buildFormData());
}

function focusField(elementId: string) {
	document.getElementById(`n8n-form-el-${elementId}`)?.focus();
}

defineExpose({ runtime });
</script>

<template>
	<div class="n8n-form-root" :style="themeVars">
		<form class="n8n-form-card" novalidate @submit.prevent="onSubmit">
			<img
				v-if="definition.theme.logoUrl"
				class="n8n-form-logo"
				:src="definition.theme.logoUrl"
				alt=""
			/>
			<h1 v-if="definition.title" class="n8n-form-title">{{ definition.title }}</h1>
			<p v-if="definition.description" class="n8n-form-subtitle">{{ definition.description }}</p>

			<div
				v-if="errorEntries.length > 0"
				ref="summaryElement"
				class="n8n-form-error-summary"
				tabindex="-1"
				role="alert"
				aria-labelledby="n8n-form-error-summary-heading"
			>
				<p id="n8n-form-error-summary-heading" class="n8n-form-error-summary-heading">
					Fix the following to submit the form:
				</p>
				<ul>
					<li v-for="entry in errorEntries" :key="entry.id">
						<a href="#" @click.prevent="focusField(entry.id)">{{ entry.label }}</a
						>: {{ entry.message }}
					</li>
				</ul>
			</div>

			<TransitionGroup name="n8n-form-field-fade" tag="div" class="n8n-form-fields">
				<FieldControl
					v-for="element in previewElements"
					:key="element.id"
					:element="element"
					:value="runtime.values[element.id]"
					:error="runtime.errors.value[element.id]"
					:selectable="mode === 'preview'"
					:selected="selectedElementId === element.id"
					@update="runtime.setValue(element.id, $event)"
					@select="emit('elementSelect', element.id)"
				/>
			</TransitionGroup>

			<button class="n8n-form-submit" type="submit" :disabled="submitting">
				<span v-if="!submitting">{{ buttonLabel }}</span>
				<span v-else class="n8n-form-spinner" aria-label="Submitting"></span>
			</button>

			<p v-if="appendAttribution" class="n8n-form-attribution">
				Form automated with
				<a :href="n8nWebsiteLink ?? 'https://n8n.io'" target="_blank" rel="noopener noreferrer"
					>n8n</a
				>
			</p>
		</form>
	</div>
</template>

<style>
.n8n-form-root {
	--n8n-form-color-primary: #ff6d5a;
	--n8n-form-color-background: #fbfcfe;
	--n8n-form-color-surface: #ffffff;
	--n8n-form-color-text: #555555;
	--n8n-form-color-heading: #525356;
	--n8n-form-color-error: #ea1f30;
	--n8n-form-color-border: #dbdfe7;
	--n8n-form-font-family: 'Open Sans', -apple-system, blinkmacsystemfont, 'Segoe UI', sans-serif;
	--n8n-form-font-heading: var(--n8n-form-font-family);
	--n8n-form-radius: 8px;
	--n8n-form-container-width: 480px;

	box-sizing: border-box;
	display: flex;
	justify-content: center;
	min-height: 100%;
	padding: 24px 12px;
	background: var(--n8n-form-color-background);
	font-family: var(--n8n-form-font-family);
	color: var(--n8n-form-color-text);
}

.n8n-form-root *,
.n8n-form-root *::before,
.n8n-form-root *::after {
	box-sizing: border-box;
}

.n8n-form-card {
	width: 100%;
	max-width: var(--n8n-form-container-width);
	background: var(--n8n-form-color-surface);
	border: 1px solid var(--n8n-form-color-border);
	border-radius: var(--n8n-form-radius);
	padding: 32px;
	margin: auto 0;
}

.n8n-form-logo {
	max-height: 48px;
	max-width: 160px;
	margin-bottom: 16px;
}

.n8n-form-title {
	font-family: var(--n8n-form-font-heading);
	color: var(--n8n-form-color-heading);
	font-size: 24px;
	font-weight: 600;
	margin: 0 0 4px;
}

.n8n-form-subtitle {
	margin: 0 0 24px;
	font-size: 14px;
}

.n8n-form-fields {
	display: flex;
	flex-direction: column;
	gap: 20px;
	margin-bottom: 24px;
}

.n8n-form-field {
	border: 0;
	padding: 0;
	margin: 0;
}

.n8n-form-label {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: var(--n8n-form-color-heading);
	margin-bottom: 6px;
}

.n8n-form-required {
	color: var(--n8n-form-color-error);
	margin-left: 2px;
}

.n8n-form-description {
	font-size: 12px;
	margin: -2px 0 6px;
}

.n8n-form-input {
	width: 100%;
	font-family: inherit;
	font-size: 14px;
	color: var(--n8n-form-color-heading);
	background: var(--n8n-form-color-surface);
	border: 1px solid var(--n8n-form-color-border);
	border-radius: var(--n8n-form-radius);
	padding: 10px 12px;
}

.n8n-form-input:focus {
	outline: 2px solid var(--n8n-form-color-primary);
	outline-offset: 1px;
	border-color: transparent;
}

.n8n-form-input[aria-invalid='true'] {
	border-color: var(--n8n-form-color-error);
}

.n8n-form-textarea {
	min-height: 96px;
	resize: vertical;
}

.n8n-form-select[multiple] {
	min-height: 96px;
}

.n8n-form-choices {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.n8n-form-choice {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	cursor: pointer;
}

.n8n-form-choice input {
	accent-color: var(--n8n-form-color-primary);
	width: 16px;
	height: 16px;
	margin: 0;
}

.n8n-form-file {
	font-size: 14px;
	width: 100%;
}

.n8n-form-error {
	color: var(--n8n-form-color-error);
	font-size: 12px;
	margin: 6px 0 0;
}

.n8n-form-error-summary {
	border: 1px solid var(--n8n-form-color-error);
	border-radius: var(--n8n-form-radius);
	padding: 12px 16px;
	margin-bottom: 20px;
	font-size: 13px;
}

.n8n-form-error-summary-heading {
	font-weight: 600;
	color: var(--n8n-form-color-error);
	margin: 0 0 6px;
}

.n8n-form-error-summary ul {
	margin: 0;
	padding-left: 18px;
}

.n8n-form-error-summary a {
	color: var(--n8n-form-color-error);
}

.n8n-form-submit {
	width: 100%;
	font-family: inherit;
	font-size: 14px;
	font-weight: 600;
	color: #ffffff;
	background: var(--n8n-form-color-primary);
	border: 0;
	border-radius: var(--n8n-form-radius);
	padding: 12px;
	cursor: pointer;
	min-height: 44px;
}

.n8n-form-submit:hover:not(:disabled) {
	filter: brightness(0.95);
}

.n8n-form-submit:disabled {
	opacity: 0.7;
	cursor: default;
}

.n8n-form-spinner {
	display: inline-block;
	width: 16px;
	height: 16px;
	border: 2px solid rgb(255 255 255 / 40%);
	border-top-color: #ffffff;
	border-radius: 50%;
	animation: n8n-form-spin 0.8s linear infinite;
	vertical-align: middle;
}

@keyframes n8n-form-spin {
	to {
		transform: rotate(360deg);
	}
}

.n8n-form-attribution {
	text-align: center;
	font-size: 12px;
	margin: 16px 0 0;
}

.n8n-form-attribution a {
	color: var(--n8n-form-color-primary);
	text-decoration: none;
}

.n8n-form-field--selectable {
	cursor: pointer;
	border-radius: var(--n8n-form-radius);
	outline-offset: 4px;
}

.n8n-form-field--selectable:hover {
	outline: 1px dashed var(--n8n-form-color-primary);
}

.n8n-form-field--selected,
.n8n-form-field--selected:hover {
	outline: 2px solid var(--n8n-form-color-primary);
}

.n8n-form-field-fade-enter-active,
.n8n-form-field-fade-leave-active {
	transition:
		opacity 0.18s ease,
		transform 0.18s ease;
}

.n8n-form-field-fade-enter-from,
.n8n-form-field-fade-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

@media (max-width: 520px) {
	.n8n-form-card {
		padding: 20px;
	}
}
</style>
