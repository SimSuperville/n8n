<script setup lang="ts">
import type { FormDefinition } from '@n8n/form-core';
import { computed, ref, toRef, nextTick, watch, onMounted } from 'vue';

import FieldControl from './FieldControl.vue';
import { useFormRuntime } from '../composables/useFormRuntime';

const FIELD_TYPE_MIME = 'application/x-n8n-form-field-type';
const ELEMENT_ID_MIME = 'application/x-n8n-form-element-id';

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
	/** beforeElementId null = drop at the end */
	elementMove: [elementId: string, beforeElementId: string | null];
	elementInsert: [fieldType: string, beforeElementId: string | null];
	updateTitle: [title: string];
	updateDescription: [description: string];
	updateElementLabel: [elementId: string, label: string];
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

const cover = computed(() => props.definition.layout.cover);
const splitSide = computed(() => {
	if (cover.value?.imageUrl === undefined || cover.value.imageUrl === '') return null;
	return cover.value.split === 'left' || cover.value.split === 'right' ? cover.value.split : null;
});
const hasBannerCover = computed(
	() =>
		cover.value?.imageUrl !== undefined && cover.value.imageUrl !== '' && splitSide.value === null,
);
const coverStyle = computed(() =>
	cover.value?.imageUrl
		? { backgroundImage: `url(${JSON.stringify(cover.value.imageUrl)})` }
		: undefined,
);

const isOneAtATime = computed(() => props.definition.layout.mode === 'oneAtATime');

const rootClasses = computed(() => [
	'n8n-form-root',
	`n8n-form-root--density-${props.definition.layout.density ?? 'default'}`,
	/* eslint-disable @typescript-eslint/naming-convention -- CSS class names */
	{
		'n8n-form-root--one-at-a-time': isOneAtATime.value,
		'n8n-form-root--outline': props.definition.theme.buttonStyle === 'outline',
		'n8n-form-root--split': splitSide.value !== null,
		'n8n-form-root--split-right': splitSide.value === 'right',
	},
	/* eslint-enable @typescript-eslint/naming-convention */
]);

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
	if (theme.backgroundImageUrl) {
		vars['background-image'] = `url(${JSON.stringify(theme.backgroundImageUrl)})`;
		vars['background-size'] = 'cover';
		vars['background-position'] = 'center';
	}
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

// --- one-at-a-time stepping ---
const stepIndex = ref(0);
const stepDirection = ref<'forward' | 'back'>('forward');

/** Question steps; logic-hidden elements are skipped because they never enter this list */
const steps = computed(() => previewElements.value);
const isReviewStep = computed(() => isOneAtATime.value && stepIndex.value >= steps.value.length);
const currentElement = computed(() =>
	isOneAtATime.value ? steps.value[stepIndex.value] : undefined,
);
const showHeader = computed(() => !isOneAtATime.value || stepIndex.value === 0);
const isLastQuestion = computed(() => stepIndex.value === steps.value.length - 1);

const stepTransitionName = computed(() =>
	stepDirection.value === 'forward' ? 'n8n-form-step-next' : 'n8n-form-step-prev',
);

const progressPercent = computed(() => {
	const total = steps.value.length;
	if (total === 0) return 100;
	return Math.round((Math.min(stepIndex.value, total) / total) * 100);
});

// An answer can logic-hide questions before the cursor; keep the index in range
watch(
	() => steps.value.length,
	(length) => {
		if (stepIndex.value > length) stepIndex.value = length;
	},
);

async function focusCurrentStep() {
	if (props.mode !== 'live') return;
	await nextTick();
	const element = currentElement.value;
	if (element) document.getElementById(`n8n-form-el-${element.id}`)?.focus();
}

onMounted(() => {
	if (isOneAtATime.value) void focusCurrentStep();
});

function goNext() {
	if (isReviewStep.value) {
		void onSubmit();
		return;
	}
	const element = currentElement.value;
	// The builder preview navigates freely; only live respondents are gated
	if (element && props.mode === 'live' && !runtime.validateElement(element.id)) return;
	stepDirection.value = 'forward';
	stepIndex.value = Math.min(stepIndex.value + 1, steps.value.length);
	void focusCurrentStep();
}

function goPrev() {
	if (stepIndex.value === 0) return;
	stepDirection.value = 'back';
	stepIndex.value -= 1;
	void focusCurrentStep();
}

function onCardKeydown(event: KeyboardEvent) {
	if (!isOneAtATime.value || props.submitting) return;
	const target = event.target as HTMLElement;
	if (target.isContentEditable) return;
	const tag = target.tagName;
	if (event.key === 'Enter') {
		// Textareas keep Enter for newlines; Cmd/Ctrl+Enter advances
		if (tag === 'TEXTAREA' && !event.metaKey && !event.ctrlKey) return;
		// Buttons (rating steps, yes/no, nav) act on their own click
		if (tag === 'BUTTON' || tag === 'A') return;
		event.preventDefault();
		goNext();
		return;
	}
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		// Inputs and selects own their arrow keys (cursor, spinners, options)
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
		event.preventDefault();
		if (event.key === 'ArrowDown') goNext();
		else goPrev();
	}
}

// Palette drops in one-at-a-time preview insert right after the question in view
function onStepDragOver(event: DragEvent) {
	if (props.mode !== 'preview') return;
	if (!event.dataTransfer?.types.includes(FIELD_TYPE_MIME)) return;
	event.preventDefault();
	event.dataTransfer.dropEffect = 'copy';
}

function onStepDrop(event: DragEvent) {
	if (props.mode !== 'preview') return;
	const fieldType = event.dataTransfer?.getData(FIELD_TYPE_MIME);
	if (fieldType === undefined || fieldType === '') return;
	event.preventDefault();
	emit('elementInsert', fieldType, steps.value[stepIndex.value + 1]?.id ?? null);
	// Advance to the inserted question so the drop is visible
	void nextTick().then(() => {
		if (steps.value.length > stepIndex.value + 1) {
			stepDirection.value = 'forward';
			stepIndex.value += 1;
		}
	});
}

// --- drag and drop (classic builder preview) ---
const dropIndex = ref<number | null>(null);

function dropIndicatorFor(index: number): 'before' | 'after' | null {
	if (dropIndex.value === null) return null;
	if (dropIndex.value === index) return 'before';
	if (
		index === previewElements.value.length - 1 &&
		dropIndex.value === previewElements.value.length
	) {
		return 'after';
	}
	return null;
}

function onFieldDragStart(elementId: string, event: DragEvent) {
	event.dataTransfer?.setData(ELEMENT_ID_MIME, elementId);
	if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function isFormDrag(event: DragEvent): boolean {
	const types = event.dataTransfer?.types ?? [];
	return types.includes(FIELD_TYPE_MIME) || types.includes(ELEMENT_ID_MIME);
}

function onFieldsDragOver(event: DragEvent) {
	if (props.mode !== 'preview' || !isFormDrag(event)) return;
	event.preventDefault();
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

	const container = event.currentTarget as HTMLElement;
	const fields = [...container.querySelectorAll<HTMLElement>('[data-element-id]')];
	let index = fields.length;
	for (let i = 0; i < fields.length; i++) {
		const rect = fields[i].getBoundingClientRect();
		if (event.clientY < rect.top + rect.height / 2) {
			index = i;
			break;
		}
	}
	dropIndex.value = index;
}

function onFieldsDragLeave(event: DragEvent) {
	const container = event.currentTarget as HTMLElement;
	if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
	dropIndex.value = null;
}

function onFieldsDrop(event: DragEvent) {
	if (props.mode !== 'preview' || dropIndex.value === null) return;
	event.preventDefault();
	const beforeElementId = previewElements.value[dropIndex.value]?.id ?? null;
	dropIndex.value = null;
	const fieldType = event.dataTransfer?.getData(FIELD_TYPE_MIME);
	const elementId = event.dataTransfer?.getData(ELEMENT_ID_MIME);
	if (fieldType) {
		emit('elementInsert', fieldType, beforeElementId);
	} else if (elementId) {
		emit('elementMove', elementId, beforeElementId);
	}
}

// --- inline title/description editing (builder preview) ---
const editingText = ref<'title' | 'description' | null>(null);
const titleElement = ref<HTMLElement | null>(null);
const descriptionElement = ref<HTMLElement | null>(null);

async function startTextEdit(kind: 'title' | 'description') {
	if (props.mode !== 'preview') return;
	editingText.value = kind;
	await nextTick();
	const el = kind === 'title' ? titleElement.value : descriptionElement.value;
	if (el) {
		el.focus();
		const range = document.createRange();
		range.selectNodeContents(el);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
	}
}

function commitTextEdit() {
	const kind = editingText.value;
	if (kind === null) return;
	editingText.value = null;
	const el = kind === 'title' ? titleElement.value : descriptionElement.value;
	const text = el?.textContent?.trim() ?? '';
	if (kind === 'title' && text !== props.definition.title) emit('updateTitle', text);
	if (kind === 'description' && text !== (props.definition.description ?? '')) {
		emit('updateDescription', text);
	}
}

function onTextEditKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault();
		(event.target as HTMLElement).blur();
	}
	if (event.key === 'Escape') editingText.value = null;
}

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

async function focusField(elementId: string) {
	if (isOneAtATime.value) {
		const index = steps.value.findIndex((element) => element.id === elementId);
		if (index !== -1 && index !== stepIndex.value) {
			stepDirection.value = index > stepIndex.value ? 'forward' : 'back';
			stepIndex.value = index;
			await nextTick();
		}
	}
	document.getElementById(`n8n-form-el-${elementId}`)?.focus();
}

defineExpose({ runtime });
</script>

<template>
	<div :class="rootClasses" :style="themeVars">
		<div v-if="splitSide" class="n8n-form-cover-pane" :style="coverStyle" aria-hidden="true"></div>
		<form class="n8n-form-card" novalidate @submit.prevent="onSubmit" @keydown="onCardKeydown">
			<div
				v-if="hasBannerCover"
				class="n8n-form-cover-banner"
				:style="coverStyle"
				aria-hidden="true"
			></div>

			<div
				v-if="isOneAtATime"
				class="n8n-form-progress"
				role="progressbar"
				:aria-valuenow="progressPercent"
				aria-valuemin="0"
				aria-valuemax="100"
			>
				<div class="n8n-form-progress-bar" :style="{ width: `${progressPercent}%` }"></div>
			</div>

			<template v-if="showHeader">
				<img
					v-if="definition.theme.logoUrl"
					class="n8n-form-logo"
					:src="definition.theme.logoUrl"
					alt=""
				/>
				<h1
					v-if="definition.title || mode === 'preview'"
					class="n8n-form-title"
					:class="{ 'n8n-form-text-editable': mode === 'preview' }"
					@dblclick="startTextEdit('title')"
				>
					<span
						ref="titleElement"
						:contenteditable="editingText === 'title'"
						@blur="commitTextEdit"
						@keydown="onTextEditKeydown"
						>{{ definition.title || (mode === 'preview' ? 'Untitled form' : '') }}</span
					>
				</h1>
				<p
					v-if="definition.description || mode === 'preview'"
					class="n8n-form-subtitle"
					:class="{ 'n8n-form-text-editable': mode === 'preview' }"
					@dblclick="startTextEdit('description')"
				>
					<span
						ref="descriptionElement"
						:contenteditable="editingText === 'description'"
						@blur="commitTextEdit"
						@keydown="onTextEditKeydown"
						>{{ definition.description || (mode === 'preview' ? 'Add a description' : '') }}</span
					>
				</p>
			</template>

			<template v-if="!isOneAtATime">
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

				<!-- Explicit duration: element removal runs on a timer, so a throttled
					requestAnimationFrame (background tab) can't leave fields stuck mid-leave -->
				<TransitionGroup
					name="n8n-form-field-fade"
					tag="div"
					class="n8n-form-fields"
					:duration="200"
					@dragover="onFieldsDragOver"
					@dragleave="onFieldsDragLeave"
					@drop="onFieldsDrop"
				>
					<FieldControl
						v-for="(element, index) in previewElements"
						:key="element.id"
						:element="element"
						:value="runtime.values[element.id]"
						:error="runtime.errors.value[element.id]"
						:selectable="mode === 'preview'"
						:selected="selectedElementId === element.id"
						:drop-indicator="dropIndicatorFor(index)"
						@update="runtime.setValue(element.id, $event)"
						@select="emit('elementSelect', element.id)"
						@update-label="emit('updateElementLabel', element.id, $event)"
						@drag-start="onFieldDragStart(element.id, $event)"
					/>
				</TransitionGroup>

				<button class="n8n-form-submit" type="submit" :disabled="submitting">
					<span v-if="!submitting">{{ buttonLabel }}</span>
					<span v-else class="n8n-form-spinner" aria-label="Submitting"></span>
				</button>
			</template>

			<template v-else>
				<div class="n8n-form-step-viewport" @dragover="onStepDragOver" @drop="onStepDrop">
					<Transition :name="stepTransitionName" mode="out-in" :duration="250">
						<div :key="currentElement?.id ?? 'review'" class="n8n-form-step">
							<template v-if="currentElement">
								<div class="n8n-form-step-counter">{{ stepIndex + 1 }} of {{ steps.length }}</div>
								<FieldControl
									:element="currentElement"
									:value="runtime.values[currentElement.id]"
									:error="runtime.errors.value[currentElement.id]"
									:selectable="mode === 'preview'"
									:selected="selectedElementId === currentElement.id"
									:drop-indicator="null"
									@update="runtime.setValue(currentElement.id, $event)"
									@select="emit('elementSelect', currentElement.id)"
									@update-label="emit('updateElementLabel', currentElement.id, $event)"
								/>
								<div class="n8n-form-step-actions">
									<button type="button" class="n8n-form-submit n8n-form-ok" @click="goNext">
										{{ isLastQuestion ? 'Review' : 'OK' }}
									</button>
									<span class="n8n-form-enter-hint">press <kbd>Enter</kbd> ↵</span>
								</div>
							</template>
							<template v-else>
								<div class="n8n-form-step-counter">All done</div>
								<h2 class="n8n-form-review-heading">Ready to submit?</h2>
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
								<button class="n8n-form-submit" type="submit" :disabled="submitting">
									<span v-if="!submitting">{{ buttonLabel }}</span>
									<span v-else class="n8n-form-spinner" aria-label="Submitting"></span>
								</button>
							</template>
						</div>
					</Transition>
				</div>

				<div class="n8n-form-step-nav">
					<button
						type="button"
						class="n8n-form-step-nav-button"
						aria-label="Previous question"
						:disabled="stepIndex === 0"
						@click="goPrev"
					>
						↑
					</button>
					<button
						type="button"
						class="n8n-form-step-nav-button"
						aria-label="Next question"
						:disabled="isReviewStep"
						@click="goNext"
					>
						↓
					</button>
				</div>
			</template>

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
	--n8n-form-gap: 20px;
	--n8n-form-card-padding: 32px;

	box-sizing: border-box;
	display: flex;
	justify-content: center;
	min-height: 100%;
	padding: 24px 12px;
	background: var(--n8n-form-color-background);
	font-family: var(--n8n-form-font-family);
	color: var(--n8n-form-color-text);
}

.n8n-form-root--density-compact {
	--n8n-form-gap: 12px;
	--n8n-form-card-padding: 22px;
}

.n8n-form-root--density-relaxed {
	--n8n-form-gap: 28px;
	--n8n-form-card-padding: 44px;
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
	padding: var(--n8n-form-card-padding);
	margin: auto 0;
}

/* --- cover image: split panes and banner --- */
.n8n-form-root--split {
	display: grid;
	grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
	padding: 0;
}

.n8n-form-cover-pane {
	background-size: cover;
	background-position: center;
	min-height: 100%;
}

.n8n-form-root--split .n8n-form-card {
	justify-self: center;
	align-self: center;
	width: calc(100% - 48px);
	margin: 24px 0;
}

.n8n-form-root--split-right .n8n-form-cover-pane {
	order: 2;
}

.n8n-form-cover-banner {
	height: 160px;
	background-size: cover;
	background-position: center;
	margin: calc(-1 * var(--n8n-form-card-padding)) calc(-1 * var(--n8n-form-card-padding)) 24px;
	border-radius: var(--n8n-form-radius) var(--n8n-form-radius) 0 0;
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
	gap: var(--n8n-form-gap);
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

/* --- outline button style --- */
.n8n-form-root--outline .n8n-form-submit {
	background: transparent;
	color: var(--n8n-form-color-primary);
	border: 2px solid var(--n8n-form-color-primary);
}

.n8n-form-root--outline .n8n-form-submit:hover:not(:disabled) {
	filter: none;
	background: var(--n8n-form-color-primary);
	color: #ffffff;
}

.n8n-form-root--outline .n8n-form-spinner {
	border-color: color-mix(in srgb, currentcolor 30%, transparent);
	border-top-color: currentcolor;
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

/* --- one-at-a-time layout --- */
.n8n-form-root--one-at-a-time .n8n-form-card {
	display: flex;
	flex-direction: column;
	min-height: min(520px, 78vh);
}

.n8n-form-progress {
	height: 4px;
	background: var(--n8n-form-color-border);
	border-radius: 2px;
	margin-bottom: 20px;
	overflow: hidden;
	flex-shrink: 0;
}

.n8n-form-progress-bar {
	height: 100%;
	background: var(--n8n-form-color-primary);
	border-radius: 2px;
	transition: width 0.25s ease;
}

.n8n-form-step-viewport {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-height: 0;
}

.n8n-form-step {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.n8n-form-step .n8n-form-label {
	font-size: 20px;
	margin-bottom: 8px;
}

.n8n-form-step .n8n-form-description {
	font-size: 14px;
	margin-top: -4px;
}

.n8n-form-step-counter {
	font-size: 13px;
	font-weight: 600;
	color: var(--n8n-form-color-primary);
}

.n8n-form-step-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.n8n-form-ok {
	width: auto;
	padding: 10px 28px;
	min-height: 40px;
}

.n8n-form-enter-hint {
	font-size: 12px;
	color: var(--n8n-form-color-text);
}

.n8n-form-enter-hint kbd {
	font-family: inherit;
	font-size: 11px;
	border: 1px solid var(--n8n-form-color-border);
	border-bottom-width: 2px;
	border-radius: 4px;
	padding: 1px 5px;
}

.n8n-form-review-heading {
	font-family: var(--n8n-form-font-heading);
	color: var(--n8n-form-color-heading);
	font-size: 20px;
	font-weight: 600;
	margin: 0;
}

.n8n-form-step-nav {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
	margin-top: 16px;
	flex-shrink: 0;
}

.n8n-form-step-nav-button {
	font-family: inherit;
	font-size: 16px;
	line-height: 1;
	width: 36px;
	height: 32px;
	color: #ffffff;
	background: var(--n8n-form-color-primary);
	border: 0;
	border-radius: var(--n8n-form-radius);
	cursor: pointer;
}

.n8n-form-step-nav-button:hover:not(:disabled) {
	filter: brightness(0.95);
}

.n8n-form-step-nav-button:disabled {
	opacity: 0.4;
	cursor: default;
}

.n8n-form-step-next-enter-active,
.n8n-form-step-next-leave-active,
.n8n-form-step-prev-enter-active,
.n8n-form-step-prev-leave-active {
	transition:
		opacity 0.22s ease,
		transform 0.22s ease;
}

.n8n-form-step-next-enter-from {
	opacity: 0;
	transform: translateY(24px);
}

.n8n-form-step-next-leave-to {
	opacity: 0;
	transform: translateY(-24px);
}

.n8n-form-step-prev-enter-from {
	opacity: 0;
	transform: translateY(-24px);
}

.n8n-form-step-prev-leave-to {
	opacity: 0;
	transform: translateY(24px);
}

.n8n-form-field--selectable {
	cursor: pointer;
	border-radius: var(--n8n-form-radius);
	outline-offset: 4px;
	position: relative;
}

.n8n-form-field--selectable:hover {
	outline: 1px dashed var(--n8n-form-color-primary);
}

.n8n-form-field--selected,
.n8n-form-field--selected:hover {
	outline: 2px solid var(--n8n-form-color-primary);
}

.n8n-form-drag-handle {
	position: absolute;
	top: 0;
	right: -2px;
	font-size: 13px;
	line-height: 1;
	color: var(--n8n-form-color-border);
	cursor: grab;
	padding: 2px 4px;
	opacity: 0;
	transition: opacity 0.12s ease;
	user-select: none;
}

.n8n-form-field--selectable:hover .n8n-form-drag-handle,
.n8n-form-field--selected .n8n-form-drag-handle {
	opacity: 1;
	color: var(--n8n-form-color-primary);
}

.n8n-form-drag-handle:active {
	cursor: grabbing;
}

.n8n-form-field--drop-before::before,
.n8n-form-field--drop-after::after {
	content: '';
	position: absolute;
	left: 0;
	right: 0;
	height: 3px;
	border-radius: 2px;
	background: var(--n8n-form-color-primary);
}

.n8n-form-field--drop-before::before {
	top: -12px;
}

.n8n-form-field--drop-after::after {
	bottom: -12px;
}

.n8n-form-text-editable {
	cursor: text;
}

.n8n-form-text-editable span[contenteditable='true'],
.n8n-form-label-text[contenteditable='true'] {
	outline: 1px dashed var(--n8n-form-color-primary);
	outline-offset: 2px;
	border-radius: 2px;
	min-width: 20px;
	display: inline-block;
}

.n8n-form-rating-scale {
	display: flex;
	gap: 8px;
}

.n8n-form-rating-step {
	font-family: inherit;
	font-size: 14px;
	font-weight: 600;
	color: var(--n8n-form-color-heading);
	background: var(--n8n-form-color-surface);
	border: 1px solid var(--n8n-form-color-border);
	border-radius: var(--n8n-form-radius);
	min-width: 40px;
	height: 40px;
	cursor: pointer;
	transition:
		background 0.12s ease,
		color 0.12s ease,
		border-color 0.12s ease;
}

.n8n-form-rating-step:hover {
	border-color: var(--n8n-form-color-primary);
	color: var(--n8n-form-color-primary);
}

.n8n-form-rating-scale .n8n-form-rating-step--active {
	background: var(--n8n-form-color-primary);
	border-color: var(--n8n-form-color-primary);
	color: #ffffff;
}

.n8n-form-rating-stars {
	display: flex;
	gap: 4px;
}

.n8n-form-rating-stars .n8n-form-rating-step {
	border: 0;
	background: transparent;
	font-size: 28px;
	line-height: 1;
	min-width: 32px;
	height: 36px;
	color: var(--n8n-form-color-border);
	padding: 0;
}

.n8n-form-rating-stars .n8n-form-rating-step--active,
.n8n-form-rating-stars .n8n-form-rating-step:hover {
	color: #efa027;
}

.n8n-form-rating-labels {
	display: flex;
	justify-content: space-between;
	font-size: 12px;
	color: var(--n8n-form-color-text);
	margin-top: 6px;
}

.n8n-form-rating-scale {
	flex-wrap: wrap;
}

.n8n-form-yesno {
	display: flex;
	gap: 8px;
}

.n8n-form-yesno-option {
	min-width: 88px;
}

.n8n-form-statement {
	font-size: 14px;
	color: var(--n8n-form-color-text);
}

.n8n-form-statement p {
	margin: 0 0 8px;
}

.n8n-form-statement p:last-child {
	margin-bottom: 0;
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

@media (max-width: 720px) {
	.n8n-form-root--split {
		grid-template-columns: 1fr;
		grid-template-rows: 180px auto;
	}

	.n8n-form-root--split-right .n8n-form-cover-pane {
		order: 0;
	}
}

@media (max-width: 520px) {
	.n8n-form-card {
		--n8n-form-card-padding: 20px;
	}
}
</style>
