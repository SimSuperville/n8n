<script setup lang="ts">
import { safeParseFormDefinition } from '@n8n/form-core';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { N8nButton, N8nInput, N8nText } from '@n8n/design-system';

import { useWorkflowId } from '@/app/composables/useWorkflowId';
import { FORM_TRIGGER_NODE_TYPE } from '@/app/constants/nodeTypes';
import { FORM_BUILDER_VIEW } from '@/features/formBuilder/constants';
import { injectNDVStoreIfProvided } from '@/features/ndv/shared/ndv.store';
import { injectWorkflowDocumentStore } from '@/app/stores/workflowDocument.store';
import type { INodeUi } from '@/Interface';
import type { IUpdateInformation } from '@/Interface';

const props = defineProps<{
	path: string;
	value: string;
	node: INodeUi | null;
	isReadOnly?: boolean;
}>();

const emit = defineEmits<{
	valueChanged: [value: IUpdateInformation];
}>();

const router = useRouter();
const workflowId = useWorkflowId();
const workflowDocumentStore = injectWorkflowDocumentStore();
const ndvStore = injectNDVStoreIfProvided();

const showJson = ref(false);
const jsonDraft = ref('');
const jsonError = ref<string | null>(null);

const parsed = computed(() => safeParseFormDefinition(props.value ?? {}));

const summary = computed(() => {
	if (!parsed.value.success) return null;
	const definition = parsed.value.definition;
	const fieldCount = definition.page.elements.length;
	const logicCount = definition.page.logic.length;
	return {
		title: definition.title || 'Untitled form',
		fields: `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`,
		logic: logicCount > 0 ? `${logicCount} logic ${logicCount === 1 ? 'rule' : 'rules'}` : null,
	};
});

/** The builder route always anchors on the Form Trigger node */
const builderTriggerNode = computed<INodeUi | null>(() => {
	const node = props.node;
	if (!node) return null;
	if (node.type === FORM_TRIGGER_NODE_TYPE) return node;
	const parents = workflowDocumentStore.value.getParentNodes(node.name);
	for (const parentName of parents) {
		const parent = workflowDocumentStore.value.getNodeByName(parentName);
		if (parent?.type === FORM_TRIGGER_NODE_TYPE) return parent;
	}
	return null;
});

async function openBuilder() {
	const trigger = builderTriggerNode.value;
	if (!trigger) return;
	// Navigate first, then clear the NDV state — closing the NDV mid-navigation
	// re-renders NodeView while the route transition is in flight and aborts it
	await router.push({
		name: FORM_BUILDER_VIEW,
		params: { workflowId: workflowId.value, nodeId: trigger.id },
	});
	ndvStore?.value?.unsetActiveNodeName();
}

function toggleJson() {
	if (!showJson.value) {
		jsonDraft.value = props.value ?? '';
		jsonError.value = null;
	}
	showJson.value = !showJson.value;
}

function applyJson() {
	const result = safeParseFormDefinition(jsonDraft.value);
	if (!result.success) {
		jsonError.value = result.issues.join('; ');
		return;
	}
	jsonError.value = null;
	emit('valueChanged', { name: props.path, value: jsonDraft.value });
	showJson.value = false;
}
</script>

<template>
	<div :class="$style.container" data-test-id="form-definition-parameter">
		<div v-if="summary" :class="$style.summary">
			<N8nText bold size="small">{{ summary.title }}</N8nText>
			<N8nText size="xsmall" color="text-light">
				{{ summary.fields }}<template v-if="summary.logic"> · {{ summary.logic }}</template>
			</N8nText>
		</div>
		<div v-else :class="$style.summary">
			<N8nText size="small" color="danger">The form definition is invalid</N8nText>
			<N8nText v-if="!parsed.success" size="xsmall" color="text-light">
				{{ parsed.issues.slice(0, 2).join('; ') }}
			</N8nText>
		</div>

		<div :class="$style.actions">
			<N8nButton
				size="small"
				icon="pencil"
				:disabled="isReadOnly || !builderTriggerNode"
				data-test-id="open-form-builder"
				@click="openBuilder"
			>
				Open form builder
			</N8nButton>
			<N8nButton size="small" type="tertiary" text @click="toggleJson">
				{{ showJson ? 'Hide JSON' : 'Edit JSON' }}
			</N8nButton>
		</div>

		<div v-if="showJson" :class="$style.jsonEditor">
			<N8nInput v-model="jsonDraft" type="textarea" :rows="12" :disabled="isReadOnly" />
			<N8nText v-if="jsonError" size="xsmall" color="danger">{{ jsonError }}</N8nText>
			<div :class="$style.actions">
				<N8nButton size="small" type="secondary" :disabled="isReadOnly" @click="applyJson">
					Apply JSON
				</N8nButton>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius);
	padding: var(--spacing--xs);
	margin: var(--spacing--2xs) 0;
}

.summary {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--5xs);
}

.actions {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.jsonEditor {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--3xs);
}
</style>
