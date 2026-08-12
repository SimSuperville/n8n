import type { FormDefinition, FormElement } from '../definition/types';
import { uid } from '../utils/uid';

/**
 * Structural mirror of n8n-workflow's FormFieldsParameter items.
 * Duplicated here so this package has no n8n-workflow dependency.
 */
export interface LegacyFormField {
	fieldLabel: string;
	elementName?: string;
	fieldType?: string;
	requiredField?: boolean;
	fieldOptions?: { values: Array<{ option: string }> };
	multiselect?: boolean;
	multipleFiles?: boolean;
	acceptFileTypes?: string;
	formatDate?: string;
	html?: string;
	placeholder?: string;
	defaultValue?: string;
	fieldName?: string;
	fieldValue?: string;
	limitSelection?: 'exact' | 'range' | 'unlimited';
	numberOfSelections?: number;
	minSelections?: number;
	maxSelections?: number;
}

export interface LegacyFormSettings {
	formTitle?: string;
	formDescription?: string;
	buttonLabel?: string;
	customCss?: string;
}

function legacyOptions(field: LegacyFormField): Array<{ id: string; label: string }> {
	return (field.fieldOptions?.values ?? []).map((entry) => ({ id: uid(), label: entry.option }));
}

export function convertLegacyField(
	field: LegacyFormField,
	idGenerator: () => string = uid,
): FormElement {
	const type = field.fieldType ?? 'text';
	const element: FormElement = {
		id: idGenerator(),
		type,
		label: field.fieldLabel ?? '',
	};

	// From node version 2.4, fieldName is the output key and fieldLabel the display text
	if (
		field.fieldName !== undefined &&
		field.fieldName !== '' &&
		field.fieldName !== element.label
	) {
		element.key = field.fieldName;
	}
	if (field.requiredField === true) element.required = true;
	if (field.placeholder !== undefined && field.placeholder !== '') {
		element.placeholder = field.placeholder;
	}
	if (field.defaultValue !== undefined && field.defaultValue !== '') {
		element.defaultValue = field.defaultValue;
	}

	switch (type) {
		case 'dropdown':
			element.config = {
				options: legacyOptions(field),
				...(field.multiselect === true ? { multiple: true } : {}),
			};
			break;
		case 'radio':
			element.config = { options: legacyOptions(field) };
			break;
		case 'checkbox':
			element.config = {
				options: legacyOptions(field),
				...(field.limitSelection !== undefined ? { limitSelection: field.limitSelection } : {}),
				...(field.numberOfSelections !== undefined
					? { numberOfSelections: field.numberOfSelections }
					: {}),
				...(field.minSelections !== undefined ? { minSelections: field.minSelections } : {}),
				...(field.maxSelections !== undefined ? { maxSelections: field.maxSelections } : {}),
			};
			break;
		case 'file':
			element.config = {
				// Legacy default is multiple uploads allowed
				multiple: field.multipleFiles !== false,
				...(field.acceptFileTypes !== undefined && field.acceptFileTypes !== ''
					? { acceptFileTypes: field.acceptFileTypes }
					: {}),
			};
			break;
		case 'date':
			if (field.formatDate !== undefined && field.formatDate !== '') {
				element.config = { format: field.formatDate };
			}
			break;
		case 'hiddenField':
			element.type = 'hidden';
			if (element.label === '' && field.fieldName !== undefined) element.label = field.fieldName;
			if (field.fieldValue !== undefined && field.fieldValue !== '') {
				element.config = { value: field.fieldValue };
			}
			break;
		case 'html':
			element.config = { html: field.html ?? '' };
			if (field.elementName !== undefined && field.elementName !== '') {
				element.key = field.elementName;
			}
			break;
		default:
			break;
	}

	return element;
}

export function fromLegacyFields(
	fields: LegacyFormField[],
	settings: LegacyFormSettings = {},
	idGenerator: () => string = uid,
): FormDefinition {
	return {
		version: 1,
		id: idGenerator(),
		title: settings.formTitle ?? '',
		...(settings.formDescription !== undefined && settings.formDescription !== ''
			? { description: settings.formDescription }
			: {}),
		layout: { mode: 'classic' },
		theme: {
			...(settings.customCss !== undefined && settings.customCss !== ''
				? { customCss: settings.customCss }
				: {}),
		},
		page: {
			id: idGenerator(),
			elements: fields.map((field) => convertLegacyField(field, idGenerator)),
			logic: [],
		},
	};
}
