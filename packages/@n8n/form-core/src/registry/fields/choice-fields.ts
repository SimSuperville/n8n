import { z } from 'zod';

import { asString, asStringArray, choiceOptionSchema, getOptions, optionLabelById } from './shared';
import type { FormElement } from '../../definition/types';
import type { FieldTypeDescriptor } from '../types';

const dropdownConfigSchema = z.object({
	options: z.array(choiceOptionSchema).default([]),
	multiple: z.boolean().optional(),
});

type DropdownConfig = z.infer<typeof dropdownConfigSchema>;

const checkboxConfigSchema = z.object({
	options: z.array(choiceOptionSchema).default([]),
	limitSelection: z.enum(['exact', 'range', 'unlimited']).optional(),
	numberOfSelections: z.number().int().positive().optional(),
	minSelections: z.number().int().nonnegative().optional(),
	maxSelections: z.number().int().positive().optional(),
});

type CheckboxConfig = z.infer<typeof checkboxConfigSchema>;

const radioConfigSchema = z.object({
	options: z.array(choiceOptionSchema).default([]),
});

type RadioConfig = z.infer<typeof radioConfigSchema>;

function coerceSingleChoice(raw: unknown, element: FormElement): string | undefined {
	const id = asString(raw);
	if (id === undefined) return undefined;
	return optionLabelById(element, id) ?? id;
}

function coerceMultiChoice(raw: unknown, element: FormElement): string[] | undefined {
	const ids = asStringArray(raw);
	if (ids === undefined) return undefined;
	return ids.map((id) => optionLabelById(element, id) ?? id);
}

function validateSingleChoice(value: unknown, element: FormElement): string | null {
	if (typeof value !== 'string') return 'Select an option';
	const labels = getOptions(element).map((option) => option.label);
	if (!labels.includes(value)) return 'Select one of the listed options';
	return null;
}

function validateMultiChoice(value: unknown, element: FormElement): string | null {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
		return 'Select an option';
	}
	const labels = new Set(getOptions(element).map((option) => option.label));
	if ((value as string[]).some((entry) => !labels.has(entry))) {
		return 'Select one of the listed options';
	}
	return null;
}

export const dropdownField: FieldTypeDescriptor<DropdownConfig> = {
	name: 'dropdown',
	label: 'Dropdown',
	icon: 'list',
	inputKind: 'value',
	valueType: 'string',
	configSchema: dropdownConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw, element) => {
		const config = element.config as DropdownConfig | undefined;
		return config?.multiple ? coerceMultiChoice(raw, element) : coerceSingleChoice(raw, element);
	},
	validate: (value, element) => {
		const config = element.config as DropdownConfig | undefined;
		return config?.multiple
			? validateMultiChoice(value, element)
			: validateSingleChoice(value, element);
	},
};

export const radioField: FieldTypeDescriptor<RadioConfig> = {
	name: 'radio',
	label: 'Radio buttons',
	icon: 'circle-dot',
	inputKind: 'value',
	valueType: 'string',
	configSchema: radioConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw, element) => coerceSingleChoice(raw, element),
	validate: (value, element) => validateSingleChoice(value, element),
};

export const checkboxField: FieldTypeDescriptor<CheckboxConfig> = {
	name: 'checkbox',
	label: 'Checkboxes',
	icon: 'checkbox',
	inputKind: 'value',
	valueType: 'stringArray',
	configSchema: checkboxConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw, element) => coerceMultiChoice(raw, element),
	validate: (value, element) => {
		const membershipError = validateMultiChoice(value, element);
		if (membershipError !== null) return membershipError;
		const selections = (value as string[]).length;
		const config = element.config as CheckboxConfig | undefined;
		if (config?.limitSelection === 'exact' && config.numberOfSelections !== undefined) {
			if (selections !== config.numberOfSelections) {
				return `Select exactly ${config.numberOfSelections} options`;
			}
		}
		if (config?.limitSelection === 'range') {
			if (config.minSelections !== undefined && selections < config.minSelections) {
				return `Select at least ${config.minSelections} options`;
			}
			if (config.maxSelections !== undefined && selections > config.maxSelections) {
				return `Select at most ${config.maxSelections} options`;
			}
		}
		return null;
	},
};
