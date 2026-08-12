import { checkboxField, dropdownField, radioField } from './fields/choice-fields';
import { dateField, numberField } from './fields/number-date-fields';
import {
	opinionScaleField,
	phoneField,
	statementField,
	urlField,
	yesNoField,
} from './fields/phase3-fields';
import { ratingField } from './fields/rating-field';
import { fileField, hiddenField, htmlField } from './fields/special-fields';
import { emailField, passwordField, textField, textareaField } from './fields/text-fields';
import type { FieldTypeDescriptor } from './types';

const descriptors: Array<FieldTypeDescriptor<never>> = [
	textField,
	textareaField,
	emailField,
	numberField,
	ratingField,
	opinionScaleField,
	yesNoField,
	phoneField,
	urlField,
	passwordField,
	dateField,
	dropdownField,
	radioField,
	checkboxField,
	fileField,
	statementField,
	hiddenField,
	htmlField,
] as Array<FieldTypeDescriptor<never>>;

const registry = new Map<string, FieldTypeDescriptor>(
	descriptors.map((descriptor) => [descriptor.name, descriptor as FieldTypeDescriptor]),
);

export function getFieldType(name: string): FieldTypeDescriptor | undefined {
	return registry.get(name);
}

export function listFieldTypes(): FieldTypeDescriptor[] {
	return [...registry.values()];
}

/** Registers an additional field type; throws on duplicate names */
export function registerFieldType(descriptor: FieldTypeDescriptor): void {
	if (registry.has(descriptor.name)) {
		throw new Error(`Field type "${descriptor.name}" is already registered`);
	}
	registry.set(descriptor.name, descriptor);
}
