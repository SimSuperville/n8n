<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { N8nButton, N8nIcon } from '@n8n/design-system';
import { safeParseFormDefinition } from '@n8n/form-core';
import type { IWorkflowDb } from '@/Interface';
import type { IExecutionResponse } from '@/features/execution/executions/executions.types';
import { injectStrict } from '@/app/utils/injectStrict';
import { WorkflowDocumentStoreKey } from '@/app/constants/injectionKeys';
import { FORM_TRIGGER_NODE_TYPE } from '@/app/constants/nodeTypes';
import { useEditorContext } from '@/app/composables/useEditorContext';
import { useWorkflowInitialization } from '@/app/composables/useWorkflowInitialization';
import MainHeader from '@/app/components/MainHeader/MainHeader.vue';
import NodeView from '@/app/views/NodeView.vue';
import FormBuilderView from '@/features/formBuilder/views/FormBuilderView.vue';
import LogsPanel from '@/features/execution/logs/components/LogsPanel.vue';
import { canvasEventBus } from '@/features/workflows/canvas/canvas.eventBus';
import { useCanvasStore } from '@/app/stores/canvas.store';
import { useNodeCreatorStore } from '@/features/shared/nodeCreator/nodeCreator.store';
import { useWorkflowSaveStore } from '@/app/stores/workflowSave.store';
import { useWorkflowExecutionStateStore } from '@/app/stores/workflowExecutionState.store';
import { createExecutionDataId, useExecutionDataStore } from '@/app/stores/executionData.store';
import { createWorkflowDocumentId } from '@/app/stores/workflowDocument.store';

const props = defineProps<{
	workflowId: string;
	refreshKey: number;
	/** Workflow data to open without a fetch (e.g. an editor hand-off snapshot). Falls back to fetching by id. */
	initialWorkflow?: IWorkflowDb;
	/** Execution to display once on open, seeded directly (e.g. an editor hand-off snapshot). */
	initialExecution?: IExecutionResponse;
	/** When the loaded workflow has an editable v3 Form Trigger, render the form builder instead of the canvas. */
	preferFormBuilder?: boolean;
}>();

const emit = defineEmits<{
	ready: [];
	'workflow-loaded': [workflowId: string];
}>();

// Inject the host's scoped provides. Workflow id / document store resolve to the
// host's local refs, not the app-level globals.
const currentWorkflowDocumentStore = injectStrict(WorkflowDocumentStoreKey);

const { readOnly } = useEditorContext();
const canvasStore = useCanvasStore();
const nodeCreatorStore = useNodeCreatorStore();
const workflowSaveStore = useWorkflowSaveStore();

const { isLoading, initializeData, initializeWorkflow, openWorkflow, cleanup } =
	useWorkflowInitialization();

/**
 * Display-only counterpart of the editor's debug-mode execution loading: shows
 * the hand-off execution snapshot on the canvas. Seeds its per-execution store
 * and marks it the displayed execution — no fetch, since the editor already had
 * the run data and handed it over. A live or pending run always wins — it owns
 * `activeExecutionId`, which we never touch here. Unlike the editor's
 * `applyExecutionData` it has no debug side effects (node matching, pin-data).
 */
function showInitialExecution() {
	if (!props.initialExecution) return;
	const executionState = useWorkflowExecutionStateStore(createWorkflowDocumentId(props.workflowId));
	if (executionState.activeExecutionId !== undefined) return;
	const { id } = props.initialExecution;
	useExecutionDataStore(createExecutionDataId(id)).setExecution(props.initialExecution);
	executionState.setDisplayedExecutionId(id);
}

// NOTE: push-connection handlers (executionStarted, nodeExecuteAfter, etc.) are
// initialized today via MainHeader's onBeforeMount calling
// usePushConnection({ router }).initialize(). Because MainHeader is rendered
// inside this host, the artifact gets push handlers for free. If MainHeader
// were ever omitted from this body (e.g. a slimmer artifact header), execution
// events would silently stop landing on the canvas. Calling initialize() here
// would double-register the listener and double-process every event.
// Decoupling push init from MainHeader is a follow-up.

async function loadWorkflow(force: boolean) {
	// One-shot: open the editor hand-off snapshot on the initial mount instead
	// of fetching. Later refresh-key bumps (e.g. an agent edit) go through the
	// fetch path so the canvas reflects the saved workflow, not the stale snapshot.
	if (!force && props.initialWorkflow) {
		await openWorkflow(props.initialWorkflow);
		// `openWorkflow` loads the document but doesn't own the loading flag —
		// `initializeWorkflow` normally clears it — so clear it here or the host
		// stays in its loading state forever.
		isLoading.value = false;
	} else {
		await initializeWorkflow(force);
	}
	if (currentWorkflowDocumentStore.value) {
		emit('workflow-loaded', props.workflowId);
	}
}

onMounted(async () => {
	await initializeData();
	await loadWorkflow(false);
	// One-shot: show the hand-off execution only on this initial mount, after the
	// workflow loads so its run data maps to nodes. Later refresh-key bumps (e.g.
	// an agent edit) re-load the workflow but must not re-pin this execution.
	showInitialExecution();
	emit('ready');
});

watch(
	() => [props.workflowId, props.refreshKey] as const,
	async () => {
		await loadWorkflow(true);
	},
);

onBeforeUnmount(() => {
	cleanup();

	// Reset global singletons that hold per-workflow state and don't otherwise
	// clear on unmount. Without these, the next editor mount (e.g. navigating
	// back to /workflow/X after closing the artifact) sees stale state from
	// this artifact session — most user-visibly stuck node-creator-open hints,
	// stale range-selection mode, and lingering autosave state.
	nodeCreatorStore.isCreateNodeActive = false;
	canvasStore.setHasRangeSelection(false);
	canvasStore.newNodeInsertPosition = null;
	workflowSaveStore.reset();
});

function requestFitView() {
	canvasEventBus.emit('fitView');
}

defineExpose({ requestFitView });

const isReady = computed(() => !isLoading.value && !!currentWorkflowDocumentStore.value);

/**
 * The Form Trigger to open in the embedded form builder: only when the host
 * opted in, the store is loaded, and the node carries a static, parseable v3
 * formDefinition (expressions / runtime-generated forms fall back to the canvas).
 */
const formTriggerNodeId = computed<string | null>(() => {
	if (!props.preferFormBuilder) return null;
	// The builder auto-persists on a debounce, so it must not be reachable while
	// the host has locked the editor read-only (e.g. the agent is mid-rebuild) —
	// fall back to the canvas, which already honors this flag, instead.
	if (readOnly.value) return null;
	const store = currentWorkflowDocumentStore.value;
	if (!store) return null;
	const trigger = store.allNodes.find(
		(node) => node.type === FORM_TRIGGER_NODE_TYPE && node.typeVersion >= 3,
	);
	if (!trigger) return null;
	const parsed = safeParseFormDefinition(trigger.parameters?.formDefinition ?? {});
	return parsed.success ? trigger.id : null;
});

/** Lets the user swap the embedded builder for the canvas to reach the rest of the workflow */
const canvasRequested = ref(false);

const formBuilderNodeId = computed<string | null>(() =>
	canvasRequested.value ? null : formTriggerNodeId.value,
);
</script>

<template>
	<div :class="$style.host" data-test-id="workflow-canvas-host">
		<template v-if="isReady">
			<MainHeader :class="$style.header" />
			<div :class="$style.canvas">
				<FormBuilderView
					v-if="formBuilderNodeId"
					:workflow-id="workflowId"
					:node-id="formBuilderNodeId"
					embedded
					@show-canvas="canvasRequested = true"
				/>
				<template v-else>
					<NodeView />
					<N8nButton
						v-if="canvasRequested && formTriggerNodeId"
						:class="$style.backToForm"
						type="secondary"
						icon="pencil"
						size="small"
						data-test-id="host-back-to-form-builder"
						@click="canvasRequested = false"
					>
						Edit form
					</N8nButton>
				</template>
			</div>
			<LogsPanel :class="$style.logs" />
		</template>
		<div v-else :class="$style.centerState">
			<N8nIcon icon="loader-circle" :size="80" spin />
		</div>
	</div>
</template>

<style lang="scss" module>
.host {
	position: relative;
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.header {
	flex-shrink: 0;
}

.canvas {
	flex: 1;
	min-height: 0;
	display: flex;
	/* Positioning context for .backToForm — anchoring to .host would put the
	   button behind the logs panel instead of over the canvas */
	position: relative;
}

/* Floats over the canvas so the user can get back to the form they were editing */
.backToForm {
	position: absolute;
	right: var(--spacing--sm);
	top: var(--spacing--sm);
	z-index: 1;
}

.logs {
	flex-shrink: 0;
}

.centerState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--spacing--xs);
	flex: 1;
	min-height: 0;
}
</style>
