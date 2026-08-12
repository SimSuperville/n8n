import type { z } from 'zod';

import type { FormElement } from '../definition/types';

export type FormFieldValueType = 'string' | 'number' | 'boolean' | 'stringArray' | 'file' | 'none';

export interface SubmittedFileMeta {
	name: string;
	size: number;
	mimeType: string;
}

export interface FieldTypeDescriptor<C = Record<string, unknown>> {
	/** Registry key, referenced by FormElement.type */
	name: string;
	/** Palette label in the builder */
	label: string;
	/** Icon name in the builder palette */
	icon: string;
	/** 'value' fields produce output; 'display' fields (statement, html) do not */
	inputKind: 'value' | 'display';
	valueType: FormFieldValueType;
	/** Validates FormElement.config for this type */
	configSchema: z.ZodType<C, z.ZodTypeDef, unknown>;
	/** Column type used when linking responses to a data table */
	dataTableColumnType: 'string' | 'number' | 'boolean' | 'date';
	/**
	 * Turns the raw submitted value (string or string[] from the wire, or file metadata)
	 * into the typed output value. Returns undefined when there is no value.
	 */
	coerce(raw: unknown, element: FormElement): unknown;
	/**
	 * Validates the coerced value. Returns a human-readable error message or null.
	 * Required-ness is checked centrally; this handles type/config constraints.
	 */
	validate(value: unknown, element: FormElement): string | null;
}
