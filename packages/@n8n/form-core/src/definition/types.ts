export type FormLayoutMode = 'classic' | 'oneAtATime';

export interface FormCoverSettings {
	imageUrl?: string;
	split?: 'none' | 'left' | 'right';
}

export interface FormLayoutSettings {
	mode: FormLayoutMode;
	containerWidth?: 'narrow' | 'default' | 'wide';
	density?: 'compact' | 'default' | 'relaxed';
	cover?: FormCoverSettings;
}

export interface FormThemeColors {
	primary?: string;
	background?: string;
	surface?: string;
	text?: string;
	error?: string;
}

export interface FormThemeFont {
	family?: string;
	headingFamily?: string;
}

export interface FormTheme {
	logoUrl?: string;
	/** Page background image, rendered behind the form card */
	backgroundImageUrl?: string;
	colors?: FormThemeColors;
	font?: FormThemeFont;
	buttonStyle?: 'solid' | 'outline';
	/** Corner radius in px; legacy documents may carry a named preset */
	radius?: number | 'none' | 'sm' | 'md' | 'lg' | 'pill';
	colorScheme?: 'light' | 'dark' | 'auto';
	customCss?: string;
}

export type LogicOperator =
	| 'eq'
	| 'neq'
	| 'contains'
	| 'notContains'
	| 'gt'
	| 'gte'
	| 'lt'
	| 'lte'
	| 'isEmpty'
	| 'isNotEmpty'
	| 'in'
	| 'notIn';

export type LogicValue = string | number | boolean | Array<string | number>;

export interface LogicCondition {
	elementId: string;
	operator: LogicOperator;
	value?: LogicValue;
}

export interface LogicAction {
	type: 'show' | 'hide';
	targetElementId: string;
}

export interface LogicRule {
	id: string;
	when: {
		combinator: 'all' | 'any';
		conditions: LogicCondition[];
	};
	actions: LogicAction[];
}

export interface FormElement {
	/** Stable identity; also the wire name (`f_<id>`) of the input on submission */
	id: string;
	/** Key into the field-type registry */
	type: string;
	label: string;
	/** Output key in the submission item; defaults to the label */
	key?: string;
	/** Help text shown under the label */
	description?: string;
	required?: boolean;
	placeholder?: string;
	defaultValue?: string | number | boolean;
	/** Per-type configuration, validated by the registry descriptor's configSchema */
	config?: Record<string, unknown>;
}

export interface FormPage {
	id: string;
	title?: string;
	elements: FormElement[];
	logic: LogicRule[];
}

export interface FormStorageLink {
	dataTableId: string;
	nodeId?: string;
	columnMap: Record<string, string>;
}

export interface FormDefinition {
	/** Schema version of this document, independent of node typeVersion */
	version: 1;
	/** Stable form id, generated once when the form is created */
	id: string;
	title: string;
	description?: string;
	/** Only meaningful on the trigger node; ignored on chained page nodes */
	layout: FormLayoutSettings;
	/** Only meaningful on the trigger node; ignored on chained page nodes */
	theme: FormTheme;
	/** The page owned by this node (one node = one page) */
	page: FormPage;
	/** Builder metadata for the data-table responses link */
	storage?: FormStorageLink;
}

export interface FormChoiceOption {
	id: string;
	label: string;
}

/** Output key for an element in the submission item */
export function getElementKey(element: Pick<FormElement, 'key' | 'label'>): string {
	return element.key !== undefined && element.key !== '' ? element.key : element.label;
}

/** Wire name of an element's input on the rendered page */
export function getElementWireName(element: Pick<FormElement, 'id'>): string {
	return `f_${element.id}`;
}

/** Reverse of getElementWireName; returns null when the name is not a form wire name */
export function parseElementWireName(name: string): string | null {
	return name.startsWith('f_') ? name.slice(2) : null;
}
