import { z } from 'zod';

import type { FormDefinition } from './types';

const logicOperatorSchema = z.enum([
	'eq',
	'neq',
	'contains',
	'notContains',
	'gt',
	'gte',
	'lt',
	'lte',
	'isEmpty',
	'isNotEmpty',
	'in',
	'notIn',
]);

const logicValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.union([z.string(), z.number()])),
]);

const logicConditionSchema = z.object({
	elementId: z.string().min(1),
	operator: logicOperatorSchema,
	value: logicValueSchema.optional(),
});

const logicRuleSchema = z.object({
	id: z.string().min(1),
	when: z.object({
		combinator: z.enum(['all', 'any']),
		conditions: z.array(logicConditionSchema).min(1),
	}),
	actions: z
		.array(
			z.object({
				type: z.enum(['show', 'hide']),
				targetElementId: z.string().min(1),
			}),
		)
		.min(1),
});

const formElementSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	label: z.string(),
	key: z.string().optional(),
	description: z.string().optional(),
	required: z.boolean().optional(),
	placeholder: z.string().optional(),
	defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
	config: z.record(z.string(), z.unknown()).optional(),
});

const formPageSchema = z.object({
	id: z.string().min(1),
	title: z.string().optional(),
	elements: z.array(formElementSchema),
	logic: z.array(logicRuleSchema),
});

const formLayoutSchema = z.object({
	mode: z.enum(['classic', 'oneAtATime']),
	containerWidth: z.enum(['narrow', 'default', 'wide']).optional(),
	density: z.enum(['compact', 'default', 'relaxed']).optional(),
	cover: z
		.object({
			imageUrl: z.string().optional(),
			split: z.enum(['none', 'left', 'right']).optional(),
		})
		.optional(),
});

const formThemeSchema = z.object({
	logoUrl: z.string().optional(),
	backgroundImageUrl: z.string().optional(),
	colors: z
		.object({
			primary: z.string().optional(),
			background: z.string().optional(),
			surface: z.string().optional(),
			text: z.string().optional(),
			error: z.string().optional(),
		})
		.optional(),
	font: z
		.object({
			family: z.string().optional(),
			headingFamily: z.string().optional(),
		})
		.optional(),
	buttonStyle: z.enum(['solid', 'outline']).optional(),
	radius: z.enum(['none', 'sm', 'md', 'lg', 'pill']).optional(),
	colorScheme: z.enum(['light', 'dark', 'auto']).optional(),
	customCss: z.string().optional(),
});

const formStorageLinkSchema = z.object({
	dataTableId: z.string().min(1),
	nodeId: z.string().optional(),
	columnMap: z.record(z.string(), z.string()),
});

export const formDefinitionSchema = z.object({
	version: z.literal(1),
	id: z.string().min(1),
	title: z.string(),
	description: z.string().optional(),
	layout: formLayoutSchema,
	theme: formThemeSchema,
	page: formPageSchema,
	storage: formStorageLinkSchema.optional(),
});

export class FormDefinitionParseError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid form definition: ${issues.join('; ')}`);
		this.name = 'FormDefinitionParseError';
	}
}

/**
 * Structural checks that the zod schema cannot express:
 * unique element ids, unique output keys, and logic rules referencing real elements.
 */
export function collectStructuralIssues(definition: FormDefinition): string[] {
	const issues: string[] = [];
	const elementIds = new Set<string>();
	const outputKeys = new Set<string>();

	for (const element of definition.page.elements) {
		if (elementIds.has(element.id)) {
			issues.push(`Duplicate element id "${element.id}"`);
		}
		elementIds.add(element.id);

		const key = element.key !== undefined && element.key !== '' ? element.key : element.label;
		if (key !== '') {
			if (outputKeys.has(key)) {
				issues.push(`Duplicate output key "${key}"`);
			}
			outputKeys.add(key);
		}
	}

	for (const rule of definition.page.logic) {
		for (const condition of rule.when.conditions) {
			if (!elementIds.has(condition.elementId)) {
				issues.push(`Logic rule "${rule.id}" references unknown element "${condition.elementId}"`);
			}
		}
		for (const action of rule.actions) {
			if (!elementIds.has(action.targetElementId)) {
				issues.push(`Logic rule "${rule.id}" targets unknown element "${action.targetElementId}"`);
			}
		}
	}

	return issues;
}

export function parseFormDefinition(raw: unknown): FormDefinition {
	const input = typeof raw === 'string' ? parseJson(raw) : raw;
	const result = formDefinitionSchema.safeParse(input);
	if (!result.success) {
		throw new FormDefinitionParseError(
			result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
		);
	}
	const definition = result.data as FormDefinition;
	const structuralIssues = collectStructuralIssues(definition);
	if (structuralIssues.length > 0) {
		throw new FormDefinitionParseError(structuralIssues);
	}
	return definition;
}

export function safeParseFormDefinition(
	raw: unknown,
): { success: true; definition: FormDefinition } | { success: false; issues: string[] } {
	try {
		return { success: true, definition: parseFormDefinition(raw) };
	} catch (error) {
		if (error instanceof FormDefinitionParseError) {
			return { success: false, issues: error.issues };
		}
		return { success: false, issues: [error instanceof Error ? error.message : String(error)] };
	}
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new FormDefinitionParseError(['Value is not valid JSON']);
	}
}
