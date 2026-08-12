import { z } from 'zod';

import { asTrimmedString } from './shared';
import type { FieldTypeDescriptor } from '../types';

const numberConfigSchema = z.object({
	min: z.number().optional(),
	max: z.number().optional(),
	step: z.number().positive().optional(),
});

type NumberConfig = z.infer<typeof numberConfigSchema>;

export const numberField: FieldTypeDescriptor<NumberConfig> = {
	name: 'number',
	label: 'Number',
	icon: 'hash',
	inputKind: 'value',
	valueType: 'number',
	configSchema: numberConfigSchema,
	dataTableColumnType: 'number',
	coerce: (raw) => {
		const text = asTrimmedString(raw);
		if (text === undefined) return undefined;
		return Number(text);
	},
	validate: (value, element) => {
		if (typeof value !== 'number' || Number.isNaN(value)) return 'Enter a number';
		const config = element.config as NumberConfig | undefined;
		if (config?.min !== undefined && value < config.min) {
			return `Enter a number of at least ${config.min}`;
		}
		if (config?.max !== undefined && value > config.max) {
			return `Enter a number of at most ${config.max}`;
		}
		return null;
	},
};

const dateConfigSchema = z.object({
	/** Luxon output format applied by the server when building the output item */
	format: z.string().optional(),
});

type DateConfig = z.infer<typeof dateConfigSchema>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dateField: FieldTypeDescriptor<DateConfig> = {
	name: 'date',
	label: 'Date',
	icon: 'calendar',
	inputKind: 'value',
	valueType: 'string',
	configSchema: dateConfigSchema,
	dataTableColumnType: 'date',
	coerce: (raw) => asTrimmedString(raw),
	validate: (value) => {
		if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
			return 'Enter a valid date';
		}
		const parsed = new Date(`${value}T00:00:00Z`);
		if (Number.isNaN(parsed.getTime())) return 'Enter a valid date';
		return null;
	},
};
