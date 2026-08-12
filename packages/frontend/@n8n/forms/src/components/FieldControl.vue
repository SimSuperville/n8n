<script setup lang="ts">
import type { FormChoiceOption, FormElement } from '@n8n/form-core';
import { computed } from 'vue';

const props = defineProps<{
	element: FormElement;
	value: unknown;
	error?: string;
	/** Builder preview: renders a selection affordance and emits select on click */
	selectable?: boolean;
	selected?: boolean;
}>();

const emit = defineEmits<{
	update: [value: unknown];
	select: [];
}>();

const fieldClasses = computed(() => ({
	'n8n-form-field': true,
	'n8n-form-field--selectable': props.selectable === true,
	'n8n-form-field--selected': props.selected === true,
}));

function onFieldClick() {
	if (props.selectable) emit('select');
}

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

const textInputType = computed(() => {
	switch (props.element.type) {
		case 'email':
			return 'email';
		case 'password':
			return 'password';
		default:
			return 'text';
	}
});

const isTextLike = computed(() => ['text', 'email', 'password'].includes(props.element.type));
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
		<legend class="n8n-form-label">
			{{ element.label }}<span v-if="element.required" class="n8n-form-required">*</span>
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
		<label class="n8n-form-label" :for="inputId">
			{{ element.label }}<span v-if="element.required" class="n8n-form-required">*</span>
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
			:min="config.min as number | undefined"
			:max="config.max as number | undefined"
			:step="config.step as number | undefined"
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
			:accept="config.acceptFileTypes as string | undefined"
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
