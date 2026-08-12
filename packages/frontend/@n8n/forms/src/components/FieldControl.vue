<script setup lang="ts">
import {
	getOpinionScaleBounds,
	getRatingBounds,
	type FormChoiceOption,
	type FormElement,
	type OpinionScaleConfig,
	type RatingConfig,
	type YesNoConfig,
} from '@n8n/form-core';
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{
	element: FormElement;
	value: unknown;
	error?: string;
	/** Builder preview: renders a selection affordance and emits select on click */
	selectable?: boolean;
	selected?: boolean;
	/** Builder preview: renders a drop indicator when a drag hovers this field */
	dropIndicator?: 'before' | 'after' | null;
}>();

const emit = defineEmits<{
	update: [value: unknown];
	select: [];
	updateLabel: [label: string];
	dragStart: [event: DragEvent];
}>();

/* eslint-disable @typescript-eslint/naming-convention -- CSS class names */
const fieldClasses = computed(() => ({
	'n8n-form-field': true,
	'n8n-form-field--selectable': props.selectable,
	'n8n-form-field--selected': props.selected,
	'n8n-form-field--drop-before': props.dropIndicator === 'before',
	'n8n-form-field--drop-after': props.dropIndicator === 'after',
}));
/* eslint-enable @typescript-eslint/naming-convention */

function onFieldClick() {
	if (props.selectable) emit('select');
}

// --- inline label editing (builder preview) ---
const editingLabel = ref(false);
const labelElement = ref<HTMLElement | null>(null);

async function startLabelEdit() {
	if (!props.selectable) return;
	editingLabel.value = true;
	await nextTick();
	const el = labelElement.value;
	if (el) {
		el.focus();
		const range = document.createRange();
		range.selectNodeContents(el);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
	}
}

function commitLabelEdit() {
	if (!editingLabel.value) return;
	editingLabel.value = false;
	const text = labelElement.value?.textContent?.trim() ?? '';
	if (text !== '' && text !== props.element.label) emit('updateLabel', text);
}

function onLabelKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter') {
		event.preventDefault();
		(event.target as HTMLElement).blur();
	}
	if (event.key === 'Escape') {
		editingLabel.value = false;
		if (labelElement.value) labelElement.value.textContent = props.element.label;
	}
}

function onHandleDragStart(event: DragEvent) {
	emit('dragStart', event);
}

// --- rating / opinion scale (shared control) ---
const isScaleType = computed(() => ['rating', 'opinionScale'].includes(props.element.type));
const ratingConfig = computed(() => props.element.config as RatingConfig | undefined);
const ratingBounds = computed(() =>
	props.element.type === 'opinionScale'
		? getOpinionScaleBounds(props.element.config as OpinionScaleConfig | undefined)
		: getRatingBounds(ratingConfig.value),
);
const ratingStyle = computed(() =>
	props.element.type === 'opinionScale' ? 'scale' : (ratingConfig.value?.style ?? 'scale'),
);
const ratingSteps = computed(() => {
	const { min, max } = ratingBounds.value;
	return Array.from({ length: max - min + 1 }, (_, index) => min + index);
});
const ratingValue = computed(() =>
	typeof props.value === 'string' ? Number(props.value) : (props.value as number | undefined),
);
const scaleEndLabels = computed(() => {
	const config = props.element.config as { lowLabel?: string; highLabel?: string } | undefined;
	return { low: config?.lowLabel, high: config?.highLabel };
});

function selectRating(step: number) {
	emit('update', String(step));
}

// --- yes/no ---
const yesNoConfig = computed(() => props.element.config as YesNoConfig | undefined);
const yesNoValue = computed(() => {
	if (props.value === 'true' || props.value === true) return true;
	if (props.value === 'false' || props.value === false) return false;
	return undefined;
});

function selectYesNo(answer: boolean) {
	emit('update', String(answer));
}

// --- statement ---
const statementParagraphs = computed(() => {
	const text = (props.element.config as { text?: string } | undefined)?.text ?? '';
	return text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
});

const inputId = computed(() => `n8n-form-el-${props.element.id}`);
const descriptionId = computed(() => `${inputId.value}-description`);
const errorId = computed(() => `${inputId.value}-error`);

const describedBy = computed(() => {
	const ids: string[] = [];
	if (props.element.description) ids.push(descriptionId.value);
	if (props.error) ids.push(errorId.value);
	return ids.length > 0 ? ids.join(' ') : undefined;
});

const config = computed(() => props.element.config ?? {});
const options = computed(() => (config.value.options as FormChoiceOption[] | undefined) ?? []);
const isMultiDropdown = computed(() => config.value.multiple === true);
const numberMin = computed(() => config.value.min as number | undefined);
const numberMax = computed(() => config.value.max as number | undefined);
const numberStep = computed(() => config.value.step as number | undefined);
const fileAccept = computed(() => config.value.acceptFileTypes as string | undefined);

const textInputType = computed(() => {
	switch (props.element.type) {
		case 'email':
			return 'email';
		case 'password':
			return 'password';
		case 'phone':
			return 'tel';
		case 'url':
			return 'url';
		default:
			return 'text';
	}
});

const isTextLike = computed(() =>
	['text', 'email', 'password', 'phone', 'url'].includes(props.element.type),
);
const isChoiceGroup = computed(() => ['radio', 'checkbox'].includes(props.element.type));

const stringValue = computed(() => (typeof props.value === 'string' ? props.value : ''));
const arrayValue = computed(() => (Array.isArray(props.value) ? (props.value as string[]) : []));

function onInput(event: Event) {
	emit('update', (event.target as HTMLInputElement).value);
}

function onSelect(event: Event) {
	const select = event.target as HTMLSelectElement;
	if (isMultiDropdown.value) {
		emit(
			'update',
			[...select.selectedOptions].map((option) => option.value),
		);
	} else {
		emit('update', select.value);
	}
}

function onCheckboxToggle(optionId: string, event: Event) {
	const checked = (event.target as HTMLInputElement).checked;
	const current = new Set(arrayValue.value);
	if (checked) current.add(optionId);
	else current.delete(optionId);
	emit('update', [...current]);
}

function onFiles(event: Event) {
	const files = (event.target as HTMLInputElement).files;
	emit('update', files === null ? undefined : [...files]);
}
</script>

<template>
	<div
		v-if="element.type === 'hidden'"
		:class="fieldClasses"
		class="n8n-form-field--hidden"
		:data-element-id="element.id"
		:hidden="!selectable"
		@click="onFieldClick"
	>
		<p v-if="selectable" class="n8n-form-description">Hidden field: {{ element.label }}</p>
	</div>

	<div
		v-else-if="element.type === 'html'"
		:class="fieldClasses"
		class="n8n-form-field--html"
		:data-element-id="element.id"
		@click="onFieldClick"
	>
		<!-- eslint-disable-next-line vue/no-v-html -- server-sanitized author HTML -->
		<div v-html="(config.html as string) ?? ''"></div>
	</div>

	<fieldset
		v-else-if="isChoiceGroup"
		:class="fieldClasses"
		:data-element-id="element.id"
		:aria-describedby="describedBy"
		:aria-invalid="error ? true : undefined"
		@click="onFieldClick"
	>
		<span
			v-if="selectable"
			class="n8n-form-drag-handle"
			draggable="true"
			title="Drag to reorder"
			@dragstart="onHandleDragStart"
			@click.stop
			>⠿</span
		>
		<legend class="n8n-form-label" @dblclick.stop="startLabelEdit">
			<span
				ref="labelElement"
				:contenteditable="editingLabel"
				class="n8n-form-label-text"
				@blur="commitLabelEdit"
				@keydown="onLabelKeydown"
				>{{ element.label }}</span
			><span v-if="element.required" class="n8n-form-required">*</span>
		</legend>
		<p v-if="element.description" :id="descriptionId" class="n8n-form-description">
			{{ element.description }}
		</p>
		<div class="n8n-form-choices">
			<label v-for="option in options" :key="option.id" class="n8n-form-choice">
				<input
					v-if="element.type === 'radio'"
					type="radio"
					:name="inputId"
					:value="option.id"
					:checked="stringValue === option.id"
					@change="onInput"
				/>
				<input
					v-else
					type="checkbox"
					:value="option.id"
					:checked="arrayValue.includes(option.id)"
					@change="onCheckboxToggle(option.id, $event)"
				/>
				<span>{{ option.label }}</span>
			</label>
		</div>
		<p v-if="error" :id="errorId" class="n8n-form-error" role="alert">{{ error }}</p>
	</fieldset>

	<div v-else :class="fieldClasses" :data-element-id="element.id" @click="onFieldClick">
		<span
			v-if="selectable"
			class="n8n-form-drag-handle"
			draggable="true"
			title="Drag to reorder"
			@dragstart="onHandleDragStart"
			@click.stop
			>⠿</span
		>
		<label class="n8n-form-label" :for="inputId" @dblclick.stop="startLabelEdit">
			<span
				ref="labelElement"
				:contenteditable="editingLabel"
				class="n8n-form-label-text"
				@blur="commitLabelEdit"
				@keydown="onLabelKeydown"
				>{{ element.label }}</span
			><span v-if="element.required" class="n8n-form-required">*</span>
		</label>
		<p v-if="element.description" :id="descriptionId" class="n8n-form-description">
			{{ element.description }}
		</p>

		<input
			v-if="isTextLike"
			:id="inputId"
			:type="textInputType"
			class="n8n-form-input"
			:value="stringValue"
			:placeholder="element.placeholder"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@input="onInput"
		/>

		<textarea
			v-else-if="element.type === 'textarea'"
			:id="inputId"
			class="n8n-form-input n8n-form-textarea"
			:value="stringValue"
			:placeholder="element.placeholder"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@input="onInput"
		></textarea>

		<input
			v-else-if="element.type === 'number'"
			:id="inputId"
			type="number"
			class="n8n-form-input"
			:value="stringValue"
			:placeholder="element.placeholder"
			:min="numberMin"
			:max="numberMax"
			:step="numberStep"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@input="onInput"
		/>

		<input
			v-else-if="element.type === 'date'"
			:id="inputId"
			type="date"
			class="n8n-form-input"
			:value="stringValue"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@input="onInput"
		/>

		<div
			v-else-if="isScaleType"
			:id="inputId"
			class="n8n-form-rating"
			role="radiogroup"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
		>
			<div :class="ratingStyle === 'stars' ? 'n8n-form-rating-stars' : 'n8n-form-rating-scale'">
				<button
					v-for="step in ratingSteps"
					:key="step"
					type="button"
					role="radio"
					:aria-checked="ratingValue === step"
					:aria-label="`${step}`"
					class="n8n-form-rating-step"
					:class="{
						'n8n-form-rating-step--active':
							ratingStyle === 'stars'
								? ratingValue !== undefined && step <= (ratingValue ?? 0)
								: ratingValue === step,
					}"
					@click="selectRating(step)"
				>
					<template v-if="ratingStyle === 'stars'">★</template>
					<template v-else>{{ step }}</template>
				</button>
			</div>
			<div v-if="scaleEndLabels.low || scaleEndLabels.high" class="n8n-form-rating-labels">
				<span>{{ scaleEndLabels.low }}</span>
				<span>{{ scaleEndLabels.high }}</span>
			</div>
		</div>

		<div
			v-else-if="element.type === 'yesNo'"
			:id="inputId"
			class="n8n-form-yesno"
			role="radiogroup"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
		>
			<button
				type="button"
				role="radio"
				:aria-checked="yesNoValue === true"
				class="n8n-form-rating-step n8n-form-yesno-option"
				:class="{ 'n8n-form-rating-step--active': yesNoValue === true }"
				@click="selectYesNo(true)"
			>
				{{ yesNoConfig?.yesLabel || 'Yes' }}
			</button>
			<button
				type="button"
				role="radio"
				:aria-checked="yesNoValue === false"
				class="n8n-form-rating-step n8n-form-yesno-option"
				:class="{ 'n8n-form-rating-step--active': yesNoValue === false }"
				@click="selectYesNo(false)"
			>
				{{ yesNoConfig?.noLabel || 'No' }}
			</button>
		</div>

		<div v-else-if="element.type === 'statement'" class="n8n-form-statement">
			<p v-for="(paragraph, pIndex) in statementParagraphs" :key="pIndex">{{ paragraph }}</p>
		</div>

		<select
			v-else-if="element.type === 'dropdown'"
			:id="inputId"
			class="n8n-form-input n8n-form-select"
			:multiple="isMultiDropdown"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@change="onSelect"
		>
			<option v-if="!isMultiDropdown" value="" :selected="stringValue === ''" disabled>
				{{ element.placeholder || 'Select an option' }}
			</option>
			<option
				v-for="option in options"
				:key="option.id"
				:value="option.id"
				:selected="isMultiDropdown ? arrayValue.includes(option.id) : stringValue === option.id"
			>
				{{ option.label }}
			</option>
		</select>

		<input
			v-else-if="element.type === 'file'"
			:id="inputId"
			type="file"
			class="n8n-form-file"
			:multiple="config.multiple === true"
			:accept="fileAccept"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@change="onFiles"
		/>

		<input
			v-else
			:id="inputId"
			type="text"
			class="n8n-form-input"
			:value="stringValue"
			:placeholder="element.placeholder"
			:aria-describedby="describedBy"
			:aria-invalid="error ? true : undefined"
			@input="onInput"
		/>

		<p v-if="error" :id="errorId" class="n8n-form-error" role="alert">{{ error }}</p>
	</div>
</template>
