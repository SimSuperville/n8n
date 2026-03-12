<script setup lang="ts">
import { computed } from 'vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { abbreviateNumber } from '@/app/utils/typesUtils';
import { filterTemplateNodes } from '@/app/utils/nodeTypesUtils';
import type { ITemplatesWorkflow } from '@n8n/rest-api-client/api/templates';

import { N8nHeading, N8nIcon, N8nText } from '@n8n/design-system';

const props = defineProps<{
	workflow: ITemplatesWorkflow;
}>();

const emit = defineEmits<{
	click: [e: MouseEvent];
}>();

const filteredNodes = computed(() => filterTemplateNodes(props.workflow.nodes).slice(0, 6));

const dummyLikes = computed(() => ((props.workflow.id * 7 + 13) % 4951) + 50);
const dummyDownloads = computed(() => ((props.workflow.id * 11 + 37) % 9901) + 100);
</script>

<template>
	<div :class="$style.card" data-test-id="template-preview-card" @click="emit('click', $event)">
		<div :class="$style.preview">
			<div :class="$style.nodeGrid">
				<div v-for="node in filteredNodes" :key="node.name" :class="$style.nodeItem">
					<NodeIcon :node-type="node" :size="28" />
				</div>
			</div>
		</div>
		<div :class="$style.body">
			<N8nHeading :bold="true" size="small" :class="$style.title">
				{{ workflow.name }}
			</N8nHeading>
			<div :class="$style.stats">
				<span v-if="workflow.totalViews" :class="$style.stat">
					<N8nIcon icon="eye" size="xsmall" />
					<N8nText size="small" color="text-light">
						{{ abbreviateNumber(workflow.totalViews) }}
					</N8nText>
				</span>
				<span :class="$style.stat">
					<N8nIcon icon="thumbs-up" size="xsmall" />
					<N8nText size="small" color="text-light">
						{{ abbreviateNumber(dummyLikes) }}
					</N8nText>
				</span>
				<span :class="$style.stat">
					<N8nIcon icon="download" size="xsmall" />
					<N8nText size="small" color="text-light">
						{{ abbreviateNumber(dummyDownloads) }}
					</N8nText>
				</span>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.card {
	display: flex;
	flex-direction: column;
	border: var(--border);
	border-radius: var(--radius--lg);
	background-color: var(--color--background--light-3);
	cursor: pointer;
	overflow: hidden;
	transition:
		box-shadow 0.15s ease,
		transform 0.15s ease;

	&:hover {
		box-shadow: var(--shadow--card-hover);
		transform: translateY(-2px);

		.title {
			color: var(--color--primary);
		}
	}
}

.preview {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--spacing--lg);
	background-color: var(--color--foreground--tint-2);
	height: 140px;
}

.nodeGrid {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--sm);
	justify-content: center;
	align-items: center;
}

.nodeItem {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 48px;
	height: 48px;
	border-radius: var(--radius--lg);
	background-color: var(--color--background--light-3);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.body {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm);
}

.title {
	transition: color 0.15s ease;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.stats {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
}

.stat {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	color: var(--color--text--tint-2);
}
</style>
