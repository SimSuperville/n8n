import type { INodeProperties } from 'n8n-workflow';

/**
 * Options-collection entry that reveals the raw form definition JSON editor on
 * the formDefinition summary card in the NDV. Programmatic/AI authors can flip
 * it on; the visual builder stays the default editing surface.
 */
export const editFormJsonOption: INodeProperties = {
	displayName: 'Edit Form JSON',
	name: 'editFormJson',
	type: 'boolean',
	default: true,
	description: 'Whether to show the raw form definition JSON editor in this panel',
};
