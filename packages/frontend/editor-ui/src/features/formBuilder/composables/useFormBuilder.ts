import {
	getFieldType,
	safeParseFormDefinition,
	uid,
	type FormDefinition,
	type FormElement,
} from '@n8n/form-core';
import { computed, reactive, ref, watch } from 'vue';

import { useCanvasOperations } from '@/app/composables/useCanvasOperations';
import { FORM_NODE_TYPE, FORM_TRIGGER_NODE_TYPE } from '@/app/constants/nodeTypes';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { injectWorkflowDocumentStore } from '@/app/stores/workflowDocument.store';
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

	const pages = reactive<BuilderPage[]>([]);
	const selectedPageIndex = ref(0);
	const selectedElementId = ref<string | null>(null);
	const saveState = ref<'saved' | 'dirty' | 'saving'>('saved');
	const loadError = ref<string | null>(null);

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
			if (!next || next.type !== FORM_NODE_TYPE) break;
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
			loadError.value =
				'This form uses an older Form Trigger version. Upgrade the node to version 3 to use the visual builder.';
			return;
		}

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
		return element;
	}

	function addElement(type: string) {
		const definition = selectedPage.value?.definition;
		if (!definition) return;
		const element = newElement(type);
		definition.page.elements.push(element);
		selectedElementId.value = element.id;
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

		// Splice the new page into the chain: anchor -> new -> (whatever followed anchor)
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
					{ node: newNode.name, type: 'main', index: 0 },
					{ node: target.node, type: target.type, index: target.index },
				],
			});
		}
		workflowDocumentStore.value.addConnection({
			connection: [
				{ node: anchor.name, type: 'main', index: 0 },
				{ node: newNode.name, type: 'main', index: 0 },
			],
		});

		load();
		selectedPageIndex.value = pages.findIndex((page) => page.nodeId === newNode.id);
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
		load,
		saveNow,
		addElement,
		removeElement,
		moveElement,
		duplicateElement,
		addPage,
		removePage,
		selectPage,
	};
}
