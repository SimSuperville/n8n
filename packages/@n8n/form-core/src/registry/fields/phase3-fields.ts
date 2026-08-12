import { z } from 'zod';

import { asTrimmedString } from './shared';
import type { FieldTypeDescriptor } from '../types';

const opinionScaleConfigSchema = z.object({
	min: z.number().int().optional(),
	max: z.number().int().positive().optional(),
	lowLabel: z.string().optional(),
	highLabel: z.string().optional(),
});

export type OpinionScaleConfig = z.infer<typeof opinionScaleConfigSchema>;

export function getOpinionScaleBounds(config: OpinionScaleConfig | undefined): {
	min: number;
	max: number;
} {
	const min = config?.min ?? 0;
	const max = config?.max ?? 10;
	return { min, max: max > min ? max : min + 1 };
}

/** NPS-style 0–10 scale; same rendering family as rating but wider bounds */
export const opinionScaleField: FieldTypeDescriptor<OpinionScaleConfig> = {
	name: 'opinionScale',
	label: 'Opinion scale',
	icon: 'sliders-horizontal',
	inputKind: 'value',
	valueType: 'number',
	configSchema: opinionScaleConfigSchema,
	dataTableColumnType: 'number',
	coerce: (raw) => {
		const text = asTrimmedString(raw);
		if (text === undefined) return undefined;
		return Number(text);
	},
	validate: (value, element) => {
		if (typeof value !== 'number' || !Number.isInteger(value)) return 'Select a value';
		const { min, max } = getOpinionScaleBounds(element.config as OpinionScaleConfig | undefined);
		if (value < min || value > max) return 'Select a value';
		return null;
	},
};

const PHONE_PATTERN = /^\+?[0-9 ().-]{5,25}$/;

export const phoneField: FieldTypeDescriptor<Record<string, never>> = {
	name: 'phone',
	label: 'Phone',
	icon: 'phone',
	inputKind: 'value',
	valueType: 'string',
	configSchema: z.object({}),
	dataTableColumnType: 'string',
	coerce: (raw) => asTrimmedString(raw),
	validate: (value) => {
		if (typeof value !== 'string' || !PHONE_PATTERN.test(value)) {
			return 'Enter a valid phone number';
		}
		return null;
	},
};

export const urlField: FieldTypeDescriptor<Record<string, never>> = {
	name: 'url',
	label: 'Website',
	icon: 'link',
	inputKind: 'value',
	valueType: 'string',
	configSchema: z.object({}),
	dataTableColumnType: 'string',
	coerce: (raw) => asTrimmedString(raw),
	validate: (value) => {
		if (typeof value !== 'string') return 'Enter a URL';
		try {
			const url = new URL(value.includes('://') ? value : `https://${value}`);
			if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
				return 'Enter a valid URL';
			}
			return null;
		} catch {
			return 'Enter a valid URL';
		}
	},
};

const yesNoConfigSchema = z.object({
	yesLabel: z.string().optional(),
	noLabel: z.string().optional(),
});

export type YesNoConfig = z.infer<typeof yesNoConfigSchema>;

export const yesNoField: FieldTypeDescriptor<YesNoConfig> = {
	name: 'yesNo',
	label: 'Yes / No',
	icon: 'toggle-right',
	inputKind: 'value',
	valueType: 'boolean',
	configSchema: yesNoConfigSchema,
	dataTableColumnType: 'boolean',
	coerce: (raw) => {
		const text = asTrimmedString(raw);
		if (text === 'true') return true;
		if (text === 'false') return false;
		return undefined;
	},
	validate: (value) => (typeof value === 'boolean' ? null : 'Select yes or no'),
};

const statementConfigSchema = z.object({
	/** Plain text shown under the label; rendered as paragraphs, never as HTML */
	text: z.string().optional(),
});

export type StatementConfig = z.infer<typeof statementConfigSchema>;

/** Display-only content block: a heading (the label) plus plain text */
export const statementField: FieldTypeDescriptor<StatementConfig> = {
	name: 'statement',
	label: 'Statement',
	icon: 'text-caption',
	inputKind: 'display',
	valueType: 'none',
	configSchema: statementConfigSchema,
	dataTableColumnType: 'string',
	coerce: () => undefined,
	validate: () => null,
};
