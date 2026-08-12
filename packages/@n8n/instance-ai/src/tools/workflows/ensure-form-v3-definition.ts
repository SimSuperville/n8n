import {
	fromLegacyFields,
	safeParseFormDefinition,
	type FormDefinition,
	type LegacyFormField,
} from '@n8n/form-core';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import { FORM_NODE_TYPE, FORM_TRIGGER_NODE_TYPE, type IDataObject } from 'n8n-workflow';

type WorkflowNode = WorkflowJSON['nodes'][number];

/**
 * Same shape as the v3 node's DEFAULT_FORM_DEFINITION (nodes-base). Duplicated
 * because instance-ai must not depend on nodes-base.
 */
const DEFAULT_DEFINITION: FormDefinition = {
	version: 1,
	id: 'form',
	title: 'Contact us',
	description: "We'll get back to you soon",
	layout: { mode: 'classic' },
	theme: {},
	page: {
		id: 'page-1',
		elements: [
			{ id: 'name', type: 'text', label: 'Name', required: true, placeholder: 'Jane Doe' },
			{
				id: 'email',
				type: 'email',
				label: 'Email',
				required: true,
				placeholder: 'jane@example.com',
			},
			{ id: 'message', type: 'textarea', label: 'Message' },
		],
		logic: [],
	},
};

const LEGACY_KEYS = ['formFields', 'defineForm', 'jsonOutput', 'formTitle', 'formDescription'];

function isExpression(value: unknown): boolean {
	return typeof value === 'string' && value.startsWith('=');
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function readLegacyFields(parameters: IDataObject): LegacyFormField[] | undefined {
	const formFields = parameters.formFields;
	if (formFields === null || typeof formFields !== 'object') return undefined;
	const values = (formFields as { values?: unknown }).values;
	return Array.isArray(values) ? (values as LegacyFormField[]) : undefined;
}

/** Builds the node's v3 definition; returns undefined when the node must be left untouched. */
function computeDefinition(
	parameters: IDataObject,
	formId: string | undefined,
): FormDefinition | undefined {
	if (isExpression(parameters.formDefinition) || isExpression(parameters.formFields)) {
		return undefined; // runtime-generated form: never rewrite
	}

	const existing = safeParseFormDefinition(parameters.formDefinition ?? {});
	if (existing.success) return existing.definition;

	const legacyFields = readLegacyFields(parameters);
	const options = (parameters.options ?? {}) as IDataObject;
	const definition =
		legacyFields !== undefined
			? fromLegacyFields(legacyFields, {
					formTitle: readString(parameters.formTitle) ?? readString(options.formTitle) ?? '',
					formDescription:
						readString(parameters.formDescription) ?? readString(options.formDescription) ?? '',
				})
			: structuredClone(DEFAULT_DEFINITION);
	if (formId !== undefined) definition.id = formId;
	// The legacy converter can emit structurally invalid output (e.g. two fields
	// sharing a label collide on their output key), and the caller deletes the
	// legacy fields once we return a definition — so never hand back one that
	// would not parse.
	if (!safeParseFormDefinition(definition).success) return undefined;
	return definition;
}

/**
 * The assistant's SDK guide teaches the legacy formFields model and the node
 * defaults to typeVersion 2.6, so built Form nodes arrive legacy/invalid.
 * Normalize them to v3 with a schema-valid formDefinition so the visual
 * builder can render them. Runs alongside the other per-node build passes.
 */
export function ensureFormV3Definition(json: WorkflowJSON): void {
	const formNodes = (json.nodes ?? []).filter(
		(node): node is WorkflowNode =>
			node.type === FORM_TRIGGER_NODE_TYPE || node.type === FORM_NODE_TYPE,
	);

	// Single-form assumption: the first Form Trigger's id is shared by every form
	// node in the workflow. This pass is array-ordered and has no notion of
	// connection topology, so a workflow with two independent forms would
	// collapse their ids. Pre-seed from the trigger (rather than the first node
	// reached in the loop) so a page node listed before its trigger in
	// `json.nodes` still gets the trigger's id, not one of its own.
	const trigger = formNodes.find((node) => node.type === FORM_TRIGGER_NODE_TYPE);
	const formId = trigger ? computeDefinition(trigger.parameters ?? {}, undefined)?.id : undefined;

	for (const node of formNodes) {
		const parameters = node.parameters ?? {};

		if (node.type === FORM_NODE_TYPE && parameters.operation === 'completion') {
			node.typeVersion = 3;
			continue;
		}

		const definition = computeDefinition(parameters, formId);
		if (definition === undefined) continue; // expression-valued: leave node as-is

		// A definition that was already a valid string stays byte-for-byte verbatim
		// (never clobber user-set theme/layout or reformat their JSON).
		const hadValidString =
			typeof parameters.formDefinition === 'string' &&
			safeParseFormDefinition(parameters.formDefinition).success;

		for (const key of LEGACY_KEYS) delete parameters[key];
		if (!hadValidString) {
			parameters.formDefinition = JSON.stringify(definition, null, 2);
		}
		node.parameters = parameters;
		node.typeVersion = 3;
	}
}
