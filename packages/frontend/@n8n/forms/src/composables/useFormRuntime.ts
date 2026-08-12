import {
	evaluateVisibility,
	getFieldType,
	getElementWireName,
	validateSubmission,
	type FormDefinition,
	type FormElement,
	type FormValues,
	type SubmittedFileMeta,
} from '@n8n/form-core';
import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue';

export interface UseFormRuntimeOptions {
	definition: Ref<FormDefinition>;
	prefill?: Ref<Record<string, string> | undefined>;
}

export interface FormRuntime {
	/** Raw values keyed by element id; file fields hold File[] */
	values: Record<string, unknown>;
	errors: Ref<Record<string, string>>;
	hiddenElementIds: ComputedRef<Set<string>>;
	visibleElements: ComputedRef<FormElement[]>;
	setValue: (elementId: string, value: unknown) => void;
	/** Validates all visible fields; returns true when the page is submittable */
	validate: () => boolean;
	clearError: (elementId: string) => void;
	/** Builds the multipart body with wire names (f_<elementId>) */
	buildFormData: () => FormData;
	reset: (definition: FormDefinition, prefill?: Record<string, string>) => void;
}

function fileMeta(file: File): SubmittedFileMeta {
	return { name: file.name, size: file.size, mimeType: file.type };
}

/** Raw wire-like values for form-core validation: Files become metadata */
function toValidationValues(values: Record<string, unknown>): FormValues {
	const result: FormValues = {};
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value) && value.every((entry) => entry instanceof File)) {
			result[key] = value.map(fileMeta);
		} else {
			result[key] = value;
		}
	}
	return result;
}

function initialValues(
	definition: FormDefinition,
	prefill?: Record<string, string>,
): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const element of definition.page.elements) {
		const descriptor = getFieldType(element.type);
		if (descriptor === undefined || descriptor.inputKind === 'display') continue;
		const prefilled = prefill?.[element.id];
		if (prefilled !== undefined) {
			values[element.id] = prefilled;
		} else if (element.defaultValue !== undefined && element.defaultValue !== '') {
			values[element.id] = String(element.defaultValue);
		}
	}
	return values;
}

export function useFormRuntime(options: UseFormRuntimeOptions): FormRuntime {
	const values = reactive<Record<string, unknown>>(
		initialValues(options.definition.value, options.prefill?.value),
	);
	const errors = ref<Record<string, string>>({});

	watch(options.definition, (definition) => {
		reset(definition, options.prefill?.value);
	});

	const hiddenElementIds = computed(() =>
		evaluateVisibility(options.definition.value.page, toValidationValues(values)),
	);

	const visibleElements = computed(() =>
		options.definition.value.page.elements.filter(
			(element) => !hiddenElementIds.value.has(element.id),
		),
	);

	function setValue(elementId: string, value: unknown) {
		values[elementId] = value;
		if (errors.value[elementId] !== undefined) {
			const next = { ...errors.value };
			delete next[elementId];
			errors.value = next;
		}
	}

	function clearError(elementId: string) {
		if (errors.value[elementId] === undefined) return;
		const next = { ...errors.value };
		delete next[elementId];
		errors.value = next;
	}

	function validate(): boolean {
		const result = validateSubmission(options.definition.value.page, toValidationValues(values));
		const next: Record<string, string> = {};
		for (const error of result.errors) next[error.elementId] = error.message;
		errors.value = next;
		return result.errors.length === 0;
	}

	function buildFormData(): FormData {
		const formData = new FormData();
		const hidden = hiddenElementIds.value;
		for (const element of options.definition.value.page.elements) {
			if (hidden.has(element.id)) continue;
			const value = values[element.id];
			if (value === undefined || value === null || value === '') continue;
			const wireName = getElementWireName(element);
			if (Array.isArray(value)) {
				for (const entry of value) {
					if (entry instanceof File) formData.append(wireName, entry);
					else formData.append(wireName, String(entry as string | number | boolean));
				}
			} else {
				formData.append(wireName, String(value as string | number | boolean));
			}
		}
		return formData;
	}

	function reset(definition: FormDefinition, prefill?: Record<string, string>) {
		for (const key of Object.keys(values)) delete values[key];
		Object.assign(values, initialValues(definition, prefill));
		errors.value = {};
	}

	return {
		values,
		errors,
		hiddenElementIds,
		visibleElements,
		setValue,
		clearError,
		validate,
		buildFormData,
		reset,
	};
}
