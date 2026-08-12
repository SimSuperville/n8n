import { z } from 'zod';

import { asString } from './shared';
import type { FieldTypeDescriptor, SubmittedFileMeta } from '../types';

const fileConfigSchema = z.object({
	multiple: z.boolean().optional(),
	/** Comma-separated list of allowed extensions, e.g. ".pdf,.png" */
	acceptFileTypes: z.string().optional(),
});

type FileConfig = z.infer<typeof fileConfigSchema>;

function isFileMeta(entry: unknown): entry is SubmittedFileMeta {
	return (
		typeof entry === 'object' &&
		entry !== null &&
		typeof (entry as SubmittedFileMeta).name === 'string'
	);
}

export const fileField: FieldTypeDescriptor<FileConfig> = {
	name: 'file',
	label: 'File upload',
	icon: 'upload',
	inputKind: 'value',
	valueType: 'file',
	configSchema: fileConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw) => {
		if (raw === undefined || raw === null) return undefined;
		const files = (Array.isArray(raw) ? raw : [raw]).filter(isFileMeta);
		return files.length === 0 ? undefined : files;
	},
	validate: (value, element) => {
		if (!Array.isArray(value) || !value.every(isFileMeta)) return 'Upload a file';
		const config = element.config as FileConfig | undefined;
		if (config?.multiple !== true && value.length > 1) return 'Upload a single file';
		const accept = config?.acceptFileTypes
			?.split(',')
			.map((extension) => extension.trim().replace(/^\./, '').toLowerCase())
			.filter((extension) => extension !== '');
		if (accept !== undefined && accept.length > 0) {
			for (const file of value) {
				const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
				if (!accept.includes(extension)) {
					return `Upload files of type: ${accept.map((entry) => `.${entry}`).join(', ')}`;
				}
			}
		}
		return null;
	},
};

const hiddenConfigSchema = z.object({
	/** Fixed value; when unset, the value comes from the query-string prefill or submission */
	value: z.string().optional(),
});

type HiddenConfig = z.infer<typeof hiddenConfigSchema>;

export const hiddenField: FieldTypeDescriptor<HiddenConfig> = {
	name: 'hidden',
	label: 'Hidden',
	icon: 'eye-off',
	inputKind: 'value',
	valueType: 'string',
	configSchema: hiddenConfigSchema,
	dataTableColumnType: 'string',
	coerce: (raw, element) => {
		const config = element.config as HiddenConfig | undefined;
		if (config?.value !== undefined && config.value !== '') return config.value;
		return asString(raw);
	},
	validate: (value) => (typeof value === 'string' ? null : 'Enter a value'),
};

const htmlConfigSchema = z.object({
	/** Author-provided HTML, sanitized by the server before rendering */
	html: z.string().default(''),
});

type HtmlConfig = z.infer<typeof htmlConfigSchema>;

export const htmlField: FieldTypeDescriptor<HtmlConfig> = {
	name: 'html',
	label: 'Custom HTML',
	icon: 'code',
	inputKind: 'display',
	valueType: 'none',
	configSchema: htmlConfigSchema,
	dataTableColumnType: 'string',
	coerce: () => undefined,
	validate: () => null,
};
