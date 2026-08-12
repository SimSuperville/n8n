import { z } from 'zod';

import type { FormChoiceOption, FormElement } from '../../definition/types';

export const choiceOptionSchema = z.object({
	id: z.string().min(1),
	label: z.string(),
});

export const choicesConfigSchema = z.object({
	options: z.array(choiceOptionSchema).default([]),
});

export function getOptions(element: FormElement): FormChoiceOption[] {
	const config = element.config as { options?: FormChoiceOption[] } | undefined;
	return config?.options ?? [];
}

/** Maps a submitted option id to its label; returns undefined for unknown ids */
export function optionLabelById(element: FormElement, id: string): string | undefined {
	return getOptions(element).find((option) => option.id === id)?.label;
}

function asPrimitiveString(raw: unknown): string | undefined {
	if (typeof raw === 'string') return raw;
	if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
	return undefined;
}

export function asTrimmedString(raw: unknown): string | undefined {
	const value = asPrimitiveString(raw)?.trim();
	return value === undefined || value === '' ? undefined : value;
}

export function asString(raw: unknown): string | undefined {
	const value = asPrimitiveString(raw);
	return value === undefined || value === '' ? undefined : value;
}

export function asStringArray(raw: unknown): string[] | undefined {
	if (raw === undefined || raw === null) return undefined;
	const array = Array.isArray(raw) ? raw : [raw];
	const values = array
		.map((entry) => asPrimitiveString(entry))
		.filter((entry): entry is string => entry !== undefined && entry !== '');
	return values.length === 0 ? undefined : values;
}
