import { z } from 'zod';

import { asString, asTrimmedString } from './shared';
import type { FieldTypeDescriptor } from '../types';

const lengthConfigSchema = z.object({
	minLength: z.number().int().nonnegative().optional(),
	maxLength: z.number().int().positive().optional(),
});

type LengthConfig = z.infer<typeof lengthConfigSchema>;

function validateLength(value: unknown, config: LengthConfig | undefined): string | null {
	if (typeof value !== 'string') return 'Enter text';
	if (config?.minLength !== undefined && value.length < config.minLength) {
		return `Enter at least ${config.minLength} characters`;
	}
	if (config?.maxLength !== undefined && value.length > config.maxLength) {
		return `Enter at most ${config.maxLength} characters`;
	}
	return null;
}

export const textField: FieldTypeDescriptor<LengthConfig> = {
	name: 'text',
	label: 'Text',
	icon: 'cursor-text',
	inputKind: 'value',
	valueType: 'string',
	configSchema: lengthConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw) => asTrimmedString(raw),
	validate: (value, element) => validateLength(value, element.config as LengthConfig | undefined),
};

export const textareaField: FieldTypeDescriptor<LengthConfig> = {
	name: 'textarea',
	label: 'Long text',
	icon: 'align-left',
	inputKind: 'value',
	valueType: 'string',
	configSchema: lengthConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw) => asString(raw),
	validate: (value, element) => validateLength(value, element.config as LengthConfig | undefined),
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailField: FieldTypeDescriptor<Record<string, never>> = {
	name: 'email',
	label: 'Email',
	icon: 'mail',
	inputKind: 'value',
	valueType: 'string',
	configSchema: z.object({}),
	dataTableColumnType: 'string',
	coerce: (raw) => asTrimmedString(raw),
	validate: (value) => {
		if (typeof value !== 'string' || !EMAIL_PATTERN.test(value)) {
			return 'Enter a valid email address';
		}
		return null;
	},
};

export const passwordField: FieldTypeDescriptor<Record<string, never>> = {
	name: 'password',
	label: 'Password',
	icon: 'lock',
	inputKind: 'value',
	valueType: 'string',
	configSchema: z.object({}),
	dataTableColumnType: 'string',
	coerce: (raw) => asString(raw),
	validate: (value) => (typeof value === 'string' ? null : 'Enter a value'),
};
