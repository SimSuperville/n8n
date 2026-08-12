import { z } from 'zod';

import { asTrimmedString } from './shared';
import type { FieldTypeDescriptor } from '../types';

const ratingConfigSchema = z.object({
	/** 'scale' renders a numbered likert scale; 'stars' renders star icons */
	style: z.enum(['scale', 'stars']).optional(),
	min: z.number().int().optional(),
	max: z.number().int().positive().optional(),
	/** Caption under the lowest value, e.g. "Poor" */
	lowLabel: z.string().optional(),
	/** Caption under the highest value, e.g. "Excellent" */
	highLabel: z.string().optional(),
});

export type RatingConfig = z.infer<typeof ratingConfigSchema>;

export function getRatingBounds(config: RatingConfig | undefined): { min: number; max: number } {
	const min = config?.min ?? 1;
	const max = config?.max ?? 5;
	return { min, max: max > min ? max : min + 1 };
}

export const ratingField: FieldTypeDescriptor<RatingConfig> = {
	name: 'rating',
	label: 'Rating',
	icon: 'star',
	inputKind: 'value',
	valueType: 'number',
	configSchema: ratingConfigSchema,
	dataTableColumnType: 'number',
	coerce: (raw) => {
		const text = asTrimmedString(raw);
		if (text === undefined) return undefined;
		return Number(text);
	},
	validate: (value, element) => {
		if (typeof value !== 'number' || !Number.isInteger(value)) return 'Select a rating';
		const { min, max } = getRatingBounds(element.config as RatingConfig | undefined);
		if (value < min || value > max) return 'Select a rating';
		return null;
	},
};
