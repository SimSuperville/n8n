import {
	fromLegacyFields,
	getElementKey,
	getFieldType,
	safeParseFormDefinition,
	toUniqueDataTableColumnName,
	uid,
	type FormDefinition,
	type FormElement,
	type LegacyFormField,
	type LogicRule,
} from '@n8n/form-core';
import { computed, reactive, ref, watch } from 'vue';

import { useTelemetry } from '@n8n/composables/useTelemetry';

import { useCanvasOperations } from '@/app/composables/useCanvasOperations';
import {
	DATA_TABLE_NODE_TYPE,
	FORM_NODE_TYPE,
	FORM_TRIGGER_NODE_TYPE,
} from '@/app/constants/nodeTypes';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { injectWorkflowDocumentStore } from '@/app/stores/workflowDocument.store';
import { useDataTableStore } from '@/features/core/dataTable/dataTable.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import type { INodeUi } from '@/Interface';

export interface BuilderPage {
	nodeId: string;
	nodeName: string;
	/** 'page' for form pages; 'completion' nodes are listed but not editable inline */
	kind: 'page' | 'completion';
	definition: FormDefinition | null;
	issues: string[];
}

const SAVE_DEBOUNCE_MS = 600;
const NODE_X_OFFSET = 260;

function serializeDefinition(definition: FormDefinition): string {
	return JSON.stringify(definition, null, 2);
}

export function useFormBuilder(triggerNodeId: string) {
	const workflowDocumentStore = injectWorkflowDocumentStore();
	const nodeTypesStore = useNodeTypesStore();
	const canvasOperations = useCanvasOperations();
	const dataTableStore = useDataTableStore();
	const projectsStore = useProjectsStore();
	const telemetry = useTelemetry();

	const pages = reactive<BuilderPage[]>([]);
	const selectedPageIndex = ref(0);
	const selectedElementId = ref<string | null>(null);
	const saveState = ref<'saved' | 'dirty' | 'saving'>('saved');
	const loadError = ref<string | null>(null);
	const canUpgrade = ref(false);

	const dirtyNodeIds = new Set<string>();
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let suspendDirtyTracking = false;

	const triggerNode = computed(() => workflowDocumentStore.value.getNodeById(triggerNodeId));

	const selectedPage = computed<BuilderPage | undefined>(() => pages[selectedPageIndex.value]);

	const selectedElement = computed<FormElement | null>(() => {
		const definition = selectedPage.value?.definition;
		if (!definition || selectedElementId.value === null) return null;
		return definition.page.elements.find((el) => el.id === selectedElementId.value) ?? null;
	});

	/** The trigger's definition carries the form-level settings (title, theme, layout) */
	const formSettings = computed(() => pages[0]?.definition ?? null);

	function parseNodeDefinition(node: INodeUi): Pick<BuilderPage, 'definition' | 'issues'> {
		const raw = node.parameters?.formDefinition;
		const result = safeParseFormDefinition(raw ?? {});
		if (result.success) return { definition: result.definition, issues: [] };
		return { definition: null, issues: result.issues };
	}

	/** Walks the linear chain of Form nodes hanging off the trigger */
	function collectChain(trigger: INodeUi): INodeUi[] {
		const chain: INodeUi[] = [];
		let current: INodeUi | undefined = trigger;
		const seen = new Set<string>();
		while (current !== undefined && !seen.has(current.id)) {
			seen.add(current.id);
			const outgoing: Array<{ node: string }> =
				workflowDocumentStore.value.outgoingConnectionsByNodeName(current.name).main?.[0] ?? [];
			const nextName: string | undefined = outgoing[0]?.node;
			const next: INodeUi | undefined = nextName
				? (workflowDocumentStore.value.getNodeByName(nextName) ?? undefined)
				: undefined;
			if (!next) break;
			// The responses Data table node sits inside the chain; walk through it
			if (next.type === DATA_TABLE_NODE_TYPE) {
				current = next;
				continue;
			}
			if (next.type !== FORM_NODE_TYPE) break;
			chain.push(next);
			if (next.parameters?.operation === 'completion') break;
			current = next;
		}
		return chain;
	}

	function load() {
		const trigger = triggerNode.value;
		if (!trigger || trigger.type !== FORM_TRIGGER_NODE_TYPE) {
			loadError.value = 'This view needs a Form Trigger node.';
			return;
		}
		if (trigger.typeVersion < 3) {
			const chain = collectChain(trigger);
			const hasJsonPages = chain.some(
				(node) =>
					node.parameters?.operation !== 'completion' && node.parameters?.defineForm === 'json',
			);
			loadError.value = hasJsonPages
				? 'This form has pages defined via JSON, which the visual builder cannot upgrade automatically. Convert those pages manually.'
				: 'This form uses an older node version. Upgrade it to use the visual builder — the upgrade keeps your fields and output keys.';
			canUpgrade.value = !hasJsonPages;
			return;
		}
		canUpgrade.value = false;

		suspendDirtyTracking = true;
		pages.splice(0, pages.length);

		pages.push({
			nodeId: trigger.id,
			nodeName: trigger.name,
			kind: 'page',
			...parseNodeDefinition(trigger),
		});

		for (const node of collectChain(trigger)) {
			const kind = node.parameters?.operation === 'completion' ? 'completion' : 'page';
			pages.push({
				nodeId: node.id,
				nodeName: node.name,
				kind,
				...(kind === 'page' ? parseNodeDefinition(node) : { definition: null, issues: [] }),
			});
		}

		selectedPageIndex.value = 0;
		selectedElementId.value = null;
		saveState.value = 'saved';
		dirtyNodeIds.clear();
		snapshotSerializations();
		void Promise.resolve().then(() => {
			suspendDirtyTracking = false;
		});
	}

	function persistDirtyPages() {
		saveState.value = 'saving';
		for (const page of pages) {
			if (!dirtyNodeIds.has(page.nodeId) || page.definition === null) continue;
			const node = workflowDocumentStore.value.getNodeById(page.nodeId);
			if (!node) continue;
			workflowDocumentStore.value.setNodeParameters(
				{ name: node.name, value: { formDefinition: serializeDefinition(page.definition) } },
				true,
			);
			dirtyNodeIds.delete(page.nodeId);
		}
		saveState.value = 'saved';
	}

	function markDirty(nodeId: string) {
		if (suspendDirtyTracking) return;
		dirtyNodeIds.add(nodeId);
		saveState.value = 'dirty';
		if (saveTimer !== undefined) clearTimeout(saveTimer);
		saveTimer = setTimeout(persistDirtyPages, SAVE_DEBOUNCE_MS);
	}

	// Detect which pages actually changed by comparing serializations,
	// so a theme edit on the trigger while page 2 is selected still persists.
	const lastSerialized = new Map<string, string>();

	function snapshotSerializations() {
		lastSerialized.clear();
		for (const page of pages) {
			if (page.definition !== null) {
				lastSerialized.set(page.nodeId, serializeDefinition(page.definition));
			}
		}
	}

	watch(
		() => pages.map((page) => page.definition),
		() => {
			if (suspendDirtyTracking) return;
			for (const page of pages) {
				if (page.definition === null) continue;
				const serialized = serializeDefinition(page.definition);
				if (lastSerialized.get(page.nodeId) !== serialized) {
					lastSerialized.set(page.nodeId, serialized);
					markDirty(page.nodeId);
				}
			}
		},
		{ deep: true },
	);

	function saveNow() {
		if (saveTimer !== undefined) clearTimeout(saveTimer);
		persistDirtyPages();
	}

	// --- element operations (act on the selected page) ---

	function newElement(type: string): FormElement {
		const descriptor = getFieldType(type);
		const element: FormElement = {
			id: uid(),
			type,
			label: descriptor?.label ?? type,
		};
		if (['dropdown', 'radio', 'checkbox'].includes(type)) {
			element.config = {
				options: [
					{ id: uid(), label: 'Option 1' },
					{ id: uid(), label: 'Option 2' },
				],
			};
		}
		if (type === 'file') element.config = { multiple: true };
		if (type === 'html') element.config = { html: '<p>Your content</p>' };
		if (type === 'statement') element.config = { text: 'Add your text here' };
		if (type === 'rating') element.config = { style: 'scale', max: 5 };
		return element;
	}

	function addElement(type: string) {
		insertElementBefore(type, null);
	}

	/** Inserts a new element before the given element id; null appends at the end */
	function insertElementBefore(type: string, beforeElementId: string | null) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const element = newElement(type);
		const elements = definition.page.elements;
		const index =
			beforeElementId === null
				? elements.length
				: elements.findIndex((el) => el.id === beforeElementId);
		elements.splice(index === -1 ? elements.length : index, 0, element);
		selectedElementId.value = element.id;
	}

	/** Moves an element before the given element id; null moves it to the end */
	function moveElementBefore(elementId: string, beforeElementId: string | null) {
		const definition = selectedPage.value?.definition;
		if (!definition || elementId === beforeElementId) return;
		const elements = definition.page.elements;
		const from = elements.findIndex((el) => el.id === elementId);
		if (from === -1) return;
		const [element] = elements.splice(from, 1);
		const to =
			beforeElementId === null
				? elements.length
				: elements.findIndex((el) => el.id === beforeElementId);
		elements.splice(to === -1 ? elements.length : to, 0, element);
	}

	function updateElementLabel(elementId: string, label: string) {
		const definition = selectedPage.value?.definition;
		const element = definition?.page.elements.find((el) => el.id === elementId);
		if (element) element.label = label;
	}

	function removeElement(elementId: string) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const index = definition.page.elements.findIndex((el) => el.id === elementId);
		if (index === -1) return;
		definition.page.elements.splice(index, 1);
		definition.page.logic = definition.page.logic.filter(
			(rule) =>
				!rule.when.conditions.some((condition) => condition.elementId === elementId) &&
				!rule.actions.some((action) => action.targetElementId === elementId),
		);
		if (selectedElementId.value === elementId) selectedElementId.value = null;
	}

	function moveElement(elementId: string, direction: -1 | 1) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const elements = definition.page.elements;
		const index = elements.findIndex((el) => el.id === elementId);
		const target = index + direction;
		if (index === -1 || target < 0 || target >= elements.length) return;
		const [element] = elements.splice(index, 1);
		elements.splice(target, 0, element);
	}

	function duplicateElement(elementId: string) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const index = definition.page.elements.findIndex((el) => el.id === elementId);
		if (index === -1) return;
		const source = definition.page.elements[index];
		const copy: FormElement = structuredClone({ ...source });
		copy.id = uid();
		copy.label = `${source.label} copy`;
		delete copy.key;
		const options = (copy.config as { options?: Array<{ id: string }> } | undefined)?.options;
		if (options) for (const option of options) option.id = uid();
		definition.page.elements.splice(index + 1, 0, copy);
		selectedElementId.value = copy.id;
	}

	// --- page operations (sync to canvas nodes) ---

	function newPageDefinition(): FormDefinition {
		return {
			version: 1,
			id: formSettings.value?.id ?? uid(),
			title: `Page ${pages.filter((page) => page.kind === 'page').length + 1}`,
			layout: { mode: 'classic' },
			theme: {},
			page: { id: uid(), elements: [newElement('text')], logic: [] },
		};
	}

	function addPage() {
		const anchorPage = [...pages].reverse().find((page) => page.kind === 'page');
		const anchor = anchorPage
			? workflowDocumentStore.value.getNodeById(anchorPage.nodeId)
			: triggerNode.value;
		if (!anchor) return;

		const nodeTypeDescription = nodeTypesStore.getNodeType(FORM_NODE_TYPE, 3);
		if (!nodeTypeDescription) return;

		// Avoid stacking on top of existing nodes (e.g. the ending node)
		const position: [number, number] = [anchor.position[0] + NODE_X_OFFSET, anchor.position[1]];
		const collides = () =>
			workflowDocumentStore.value.allNodes.some(
				(node) =>
					Math.abs(node.position[0] - position[0]) < 120 &&
					Math.abs(node.position[1] - position[1]) < 100,
			);
		while (collides()) position[1] += 120;

		const definition = newPageDefinition();
		const newNode = canvasOperations.addNode(
			{
				type: FORM_NODE_TYPE,
				typeVersion: 3,
				position,
				parameters: {
					operation: 'page',
					formDefinition: serializeDefinition(definition),
				},
			},
			nodeTypeDescription,
			{ trackHistory: true, isAutoAdd: true },
		);

		spliceNodeAfter(anchor, newNode.name);

		load();
		selectedPageIndex.value = pages.findIndex((page) => page.nodeId === newNode.id);
	}

	/** Rewires the chain: anchor -> new node -> (whatever followed anchor) */
	function spliceNodeAfter(anchor: INodeUi, newNodeName: string) {
		const outgoing =
			workflowDocumentStore.value.outgoingConnectionsByNodeName(anchor.name).main?.[0] ?? [];
		for (const target of [...outgoing]) {
			workflowDocumentStore.value.removeConnection({
				connection: [
					{ node: anchor.name, type: 'main', index: 0 },
					{ node: target.node, type: target.type, index: target.index },
				],
			});
			workflowDocumentStore.value.addConnection({
				connection: [
					{ node: newNodeName, type: 'main', index: 0 },
					{ node: target.node, type: target.type, index: target.index },
				],
			});
		}
		workflowDocumentStore.value.addConnection({
			connection: [
				{ node: anchor.name, type: 'main', index: 0 },
				{ node: newNodeName, type: 'main', index: 0 },
			],
		});
	}

	function removePage(nodeId: string) {
		if (nodeId === triggerNodeId) return;
		canvasOperations.deleteNode(nodeId, { trackHistory: true });
		load();
	}

	function selectPage(index: number) {
		selectedPageIndex.value = index;
		selectedElementId.value = null;
	}

	// --- per-element visibility rules (one rule per target, id `vis_<elementId>`) ---

	function visibilityRuleId(elementId: string): string {
		return `vis_${elementId}`;
	}

	function getVisibilityRule(elementId: string): LogicRule | undefined {
		return selectedPage.value?.definition?.page.logic.find(
			(rule) => rule.id === visibilityRuleId(elementId),
		);
	}

	/** Replaces the element's visibility rule; null removes it */
	function setVisibilityRule(elementId: string, rule: LogicRule | null) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const logic = definition.page.logic;
		const index = logic.findIndex((entry) => entry.id === visibilityRuleId(elementId));
		if (index !== -1) logic.splice(index, 1);
		if (rule !== null) logic.push({ ...rule, id: visibilityRuleId(elementId) });
	}

	/** Elements the selected element's conditions may reference */
	function conditionSourceElements(targetElementId: string): FormElement[] {
		const definition = selectedPage.value?.definition;
		if (!definition) return [];
		return definition.page.elements.filter((element) => {
			if (element.id === targetElementId) return false;
			const descriptor = getFieldType(element.type);
			return (
				descriptor !== undefined &&
				descriptor.inputKind === 'value' &&
				descriptor.valueType !== 'file'
			);
		});
	}

	// --- data table responses (formDefinition.storage on the trigger) ---

	interface ResponseFieldPlan {
		elementId: string;
		key: string;
		columnType: 'string' | 'number' | 'boolean' | 'date';
		/** Multi-select values (checkbox, multi dropdown) are joined — tables store scalars */
		isArray: boolean;
		/** Node holding this element's page; the insert node reads earlier pages via $('name') */
		pageNodeName: string;
		isLastPage: boolean;
	}

	/** Value-bearing elements across all pages, in page order; files cannot be stored */
	function collectResponseFields(): ResponseFieldPlan[] {
		const pageEntries = pages.filter((page) => page.kind === 'page' && page.definition !== null);
		const lastPageNodeId = pageEntries[pageEntries.length - 1]?.nodeId;
		const fields: ResponseFieldPlan[] = [];
		for (const page of pageEntries) {
			const definition = page.definition;
			if (definition === null) continue;
			for (const element of definition.page.elements) {
				const descriptor = getFieldType(element.type);
				if (!descriptor || descriptor.inputKind !== 'value' || descriptor.valueType === 'file') {
					continue;
				}
				fields.push({
					elementId: element.id,
					key: getElementKey(element),
					columnType: descriptor.dataTableColumnType,
					isArray: descriptor.valueType === 'stringArray',
					pageNodeName: page.nodeName,
					isLastPage: page.nodeId === lastPageNodeId,
				});
			}
		}
		return fields;
	}

	function columnExpression(field: ResponseFieldPlan): string {
		const key = JSON.stringify(field.key);
		const accessor = field.isLastPage
			? `$json[${key}]`
			: `$(${JSON.stringify(field.pageNodeName)}).first().json[${key}]`;
		// Multi-select answers arrive as arrays; tables store scalars, so join them
		if (field.isArray) {
			return `={{ Array.isArray(${accessor}) ? ${accessor}.join(', ') : ${accessor} }}`;
		}
		return `={{ ${accessor} }}`;
	}

	/** Desired insert-node mapping + columnMap for the current fields */
	function buildStoragePlan(existingColumnMap: Record<string, string> = {}) {
		const taken = new Set(Object.values(existingColumnMap));
		const columnMap: Record<string, string> = {};
		const mappingValue: Record<string, string> = {};
		const newColumns: Array<{ name: string; type: ResponseFieldPlan['columnType'] }> = [];
		for (const field of collectResponseFields()) {
			let column = existingColumnMap[field.elementId];
			if (column === undefined) {
				column = toUniqueDataTableColumnName(field.key, taken);
				taken.add(column);
				newColumns.push({ name: column, type: field.columnType });
			}
			columnMap[field.elementId] = column;
			mappingValue[column] = columnExpression(field);
		}
		return { columnMap, mappingValue, newColumns };
	}

	const storage = computed(() => formSettings.value?.storage ?? null);

	const storageNode = computed(() => {
		const nodeId = storage.value?.nodeId;
		return nodeId ? workflowDocumentStore.value.getNodeById(nodeId) : undefined;
	});

	/** 'none' | 'synced' | 'outOfSync' | 'nodeMissing' */
	const dataTableState = computed(() => {
		if (!storage.value) return 'none';
		const node = storageNode.value;
		if (!node) return 'nodeMissing';
		const desired = buildStoragePlan(storage.value.columnMap);
		const current = (node.parameters?.columns as { value?: Record<string, string> } | undefined)
			?.value;
		return JSON.stringify(desired.mappingValue) === JSON.stringify(current ?? {})
			? 'synced'
			: 'outOfSync';
	});

	function insertNodeParameters(
		dataTableId: string,
		dataTableName: string,
		mappingValue: Record<string, string>,
	) {
		return {
			resource: 'row',
			operation: 'insert',
			dataTableId: {
				__rl: true,
				mode: 'id',
				value: dataTableId,
				cachedResultName: dataTableName,
			},
			columns: {
				mappingMode: 'defineBelow',
				value: mappingValue,
				matchingColumns: [],
				schema: [],
			},
		};
	}

	/** Creates a data table for the responses and a visible insert-row node after the last page */
	async function connectDataTable() {
		const settings = formSettings.value;
		if (!settings || settings.storage !== undefined) return;
		const projectId =
			workflowDocumentStore.value.homeProject?.id ?? projectsStore.personalProject?.id;
		if (projectId === undefined) throw new Error('No project available for the data table');

		const { columnMap, mappingValue, newColumns } = buildStoragePlan();
		const baseName = settings.title !== '' ? `${settings.title} responses` : 'Form responses';
		const tableName = await dataTableStore.findAvailableDataTableName(baseName, projectId);
		const table = await dataTableStore.createDataTable(tableName, projectId, newColumns);

		const lastPage = [...pages].reverse().find((page) => page.kind === 'page');
		const anchor = lastPage
			? workflowDocumentStore.value.getNodeById(lastPage.nodeId)
			: triggerNode.value;
		if (!anchor) throw new Error('Could not find a node to attach the Data table node to');

		const nodeTypeDescription = nodeTypesStore.getNodeType(DATA_TABLE_NODE_TYPE);
		if (!nodeTypeDescription) throw new Error('The Data table node is not available');
		const latestVersion = Array.isArray(nodeTypeDescription.version)
			? nodeTypeDescription.version[nodeTypeDescription.version.length - 1]
			: nodeTypeDescription.version;

		const position: [number, number] = [
			anchor.position[0] + NODE_X_OFFSET,
			anchor.position[1] + 140,
		];
		const newNode = canvasOperations.addNode(
			{
				type: DATA_TABLE_NODE_TYPE,
				typeVersion: latestVersion,
				position,
				parameters: insertNodeParameters(table.id, table.name, mappingValue),
			},
			nodeTypeDescription,
			{ trackHistory: true, isAutoAdd: true },
		);
		spliceNodeAfter(anchor, newNode.name);

		settings.storage = { dataTableId: table.id, nodeId: newNode.id, columnMap };

		telemetry.track('User connected form to data table', {
			data_table_id: table.id,
			column_count: Object.keys(columnMap).length,
		});
		return table;
	}

	/**
	 * Realigns the insert node and table with the current fields: adds columns for
	 * new fields and refreshes expressions. Columns are never deleted.
	 */
	async function syncDataTable() {
		const settings = formSettings.value;
		const link = settings?.storage;
		const node = storageNode.value;
		if (!settings || !link || !node) return;
		const projectId =
			workflowDocumentStore.value.homeProject?.id ?? projectsStore.personalProject?.id;
		if (projectId === undefined) throw new Error('No project available for the data table');

		const { columnMap, mappingValue, newColumns } = buildStoragePlan(link.columnMap);
		for (const column of newColumns) {
			await dataTableStore.addDataTableColumn(link.dataTableId, projectId, column);
		}
		const dataTableId = node.parameters?.dataTableId as { cachedResultName?: string } | undefined;
		workflowDocumentStore.value.setNodeParameters({
			name: node.name,
			value: insertNodeParameters(
				link.dataTableId,
				dataTableId?.cachedResultName ?? 'Form responses',
				mappingValue,
			),
		});
		settings.storage = { ...link, columnMap };
	}

	// --- legacy upgrade (v2.x -> v3) ---

	function replaceWithV3Params(node: INodeUi, definition: FormDefinition) {
		const {
			formFields: _fields,
			formTitle: _title,
			formDescription: _description,
			defineForm: _defineForm,
			jsonOutput: _jsonOutput,
			...rest
		} = node.parameters ?? {};
		workflowDocumentStore.value.updateNodeById(node.id, { typeVersion: 3 });
		workflowDocumentStore.value.setNodeParameters({
			name: node.name,
			value: { ...rest, formDefinition: serializeDefinition(definition) },
		});
	}

	/** Converts a legacy (v2.x) trigger and its chained pages to v3 in one pass */
	function upgradeToV3() {
		const trigger = triggerNode.value;
		if (!trigger || trigger.typeVersion >= 3 || !canUpgrade.value) return;

		const chain = collectChain(trigger);
		const options = (trigger.parameters?.options ?? {}) as { customCss?: string };
		const triggerFields =
			(trigger.parameters?.formFields as { values?: LegacyFormField[] } | undefined)?.values ?? [];
		const triggerDefinition = fromLegacyFields(triggerFields, {
			formTitle: (trigger.parameters?.formTitle as string) ?? '',
			formDescription: (trigger.parameters?.formDescription as string) ?? '',
			customCss: options.customCss,
		});
		replaceWithV3Params(trigger, triggerDefinition);

		for (const node of chain) {
			if (node.parameters?.operation === 'completion') {
				workflowDocumentStore.value.updateNodeById(node.id, { typeVersion: 3 });
				continue;
			}
			const pageOptions = (node.parameters?.options ?? {}) as {
				formTitle?: string;
				formDescription?: string;
			};
			const pageFields =
				(node.parameters?.formFields as { values?: LegacyFormField[] } | undefined)?.values ?? [];
			const pageDefinition = fromLegacyFields(pageFields, {
				formTitle: pageOptions.formTitle ?? '',
				formDescription: pageOptions.formDescription ?? '',
			});
			// Chained pages share the trigger's form id so the definition reads as one form
			pageDefinition.id = triggerDefinition.id;
			replaceWithV3Params(node, pageDefinition);
		}

		canUpgrade.value = false;
		loadError.value = null;
		load();
		telemetry.track('User upgraded form to v3', {
			page_count: pages.filter((page) => page.kind === 'page').length,
		});
	}

	return {
		pages,
		triggerNode,
		formSettings,
		selectedPageIndex,
		selectedPage,
		selectedElementId,
		selectedElement,
		saveState,
		loadError,
		canUpgrade,
		load,
		saveNow,
		addElement,
		insertElementBefore,
		moveElementBefore,
		updateElementLabel,
		getVisibilityRule,
		setVisibilityRule,
		conditionSourceElements,
		removeElement,
		moveElement,
		duplicateElement,
		addPage,
		removePage,
		selectPage,
		upgradeToV3,
		storage,
		dataTableState,
		connectDataTable,
		syncDataTable,
	};
}
