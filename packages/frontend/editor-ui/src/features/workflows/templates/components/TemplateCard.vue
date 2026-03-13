<script lang="ts" setup>
import { computed } from 'vue';
import { abbreviateNumber } from '@/app/utils/typesUtils';
import NodeList from '@/app/components/NodeList.vue';
import TimeAgo from '@/app/components/TimeAgo.vue';
import type { ITemplatesWorkflow } from '@n8n/rest-api-client/api/templates';
import { useI18n } from '@n8n/i18n';
import type { BaseTextKey } from '@n8n/i18n';

import { N8nButton, N8nHeading, N8nIcon, N8nLoading, N8nTag, N8nText } from '@n8n/design-system';
import { VIEWS } from '@/app/constants';
import { useRouter } from 'vue-router';
const i18n = useI18n();
const router = useRouter();

const nodesToBeShown = 5;

const props = withDefaults(
	defineProps<{
		workflow?: ITemplatesWorkflow;
		lastItem?: boolean;
		firstItem?: boolean;
		useWorkflowButton?: boolean;
		loading?: boolean;
		simpleView?: boolean;
	}>(),
	{
		lastItem: false,
		firstItem: false,
		useWorkflowButton: false,
		loading: false,
		simpleView: false,
	},
);

// Dummy social proof data - deterministic per workflow id
const dummyLikes = computed(() =>
	props.workflow ? ((props.workflow.id * 7 + 13) % 4951) + 50 : 0,
);
const dummyDownloads = computed(() =>
	props.workflow ? ((props.workflow.id * 11 + 37) % 9901) + 100 : 0,
);

const isPaid = computed(() =>
	props.workflow ? props.workflow.id % 17 === 0 || props.workflow.id % 23 === 0 : false,
);
const dummyPrice = computed(() =>
	props.workflow ? `£${((props.workflow.id * 3 + 7) % 16) + 5}` : '',
);

const emit = defineEmits<{
	useWorkflow: [e: MouseEvent];
	click: [e: MouseEvent];
}>();

function onUseWorkflowClick(e: MouseEvent) {
	emit('useWorkflow', e);
}

function onCardClick(e: MouseEvent) {
	emit('click', e);
}
</script>

<template>
	<div
		:class="[
			$style.card,
			lastItem && $style.last,
			firstItem && $style.first,
			!loading && $style.loaded,
		]"
		data-test-id="template-card"
		@click="onCardClick"
	>
		<div v-if="loading" :class="$style.loading">
			<N8nLoading :rows="2" :shrink-last="false" :loading="loading" />
		</div>
		<div v-else-if="workflow" :class="$style.cardBody">
			<div :class="$style.titleRow">
				<img
					v-if="workflow.user?.avatar"
					:src="workflow.user.avatar"
					:alt="workflow.user.name"
					:class="$style.creatorAvatar"
				/>
				<N8nIcon
					v-else-if="workflow.user"
					icon="user"
					:size="16"
					:class="$style.creatorAvatarFallback"
				/>
				<N8nHeading :bold="true" size="small">{{ workflow.name }}</N8nHeading>
			</div>
			<div v-if="!simpleView" :class="$style.content">
				<span v-if="workflow.totalViews">
					<N8nText size="small" color="text-light">
						<N8nIcon icon="eye" size="xsmall" />
						{{ abbreviateNumber(workflow.totalViews) }}
					</N8nText>
				</span>
				<span v-if="workflow.totalViews" data-test-id="template-card-likes">
					<N8nText size="small" color="text-light">
						<N8nIcon icon="thumbs-up" size="xsmall" />
						{{ abbreviateNumber(dummyLikes) }}
					</N8nText>
				</span>
				<span v-if="workflow.totalViews" data-test-id="template-card-downloads">
					<N8nText size="small" color="text-light">
						<N8nIcon icon="download" size="xsmall" />
						{{ abbreviateNumber(dummyDownloads) }}
					</N8nText>
				</span>
				<div v-if="workflow.totalViews" :class="$style.line" v-text="'|'" />
				<N8nText size="small" color="text-light">
					<TimeAgo :date="workflow.createdAt" />
				</N8nText>
				<div v-if="workflow.user" :class="$style.line" v-text="'|'" />
				<N8nText
					v-if="workflow.user"
					size="small"
					color="text-light"
					:class="$style.authorLink"
					@click.stop="
						router.push({
							name: VIEWS.TEMPLATE_CREATOR,
							params: { username: workflow.user.username },
						})
					"
				>
					{{
						i18n.baseText('template.byAuthor' as BaseTextKey, {
							interpolate: { name: workflow.user.username },
						})
					}}</N8nText
				>
				<N8nTag
					v-if="isPaid"
					:text="dummyPrice"
					:class="$style.paidTag"
					:clickable="false"
					data-test-id="template-card-price-tag"
				/>
			</div>
		</div>
		<div
			v-if="!loading && workflow"
			:class="[$style.nodesContainer, useWorkflowButton && $style.hideOnHover]"
		>
			<NodeList v-if="workflow.nodes" :nodes="workflow.nodes" :limit="nodesToBeShown" size="md" />
		</div>
		<div v-if="useWorkflowButton" :class="$style.buttonContainer">
			<N8nButton
				variant="outline"
				v-if="useWorkflowButton"
				label="Use workflow"
				data-test-id="use-workflow-button"
				@click.stop="onUseWorkflowClick"
			/>
		</div>
	</div>
</template>

<style lang="scss" module>
.nodes {
	display: flex;
	justify-content: center;
	align-content: center;
	flex-direction: row;
}

.icon {
	margin-left: var(--spacing--xs);
}

.card {
	position: relative;
	border-left: var(--border);
	border-right: var(--border);
	border-bottom: var(--border);
	background-color: var(--color--background--light-3);

	display: flex;
	align-items: center;
	padding: 0 var(--spacing--sm) var(--spacing--sm) var(--spacing--sm);
	background-color: var(--color--background--light-3);
	cursor: pointer;

	&:hover {
		.hideOnHover {
			visibility: hidden;
		}

		.buttonContainer {
			display: block;
		}
	}
}

.buttonContainer {
	display: none;
	position: absolute;
	right: 10px;
	top: 30%;
}

.loaded {
	padding-top: var(--spacing--sm);
}

.first {
	border-top: var(--border);
	border-top-right-radius: var(--radius--lg);
	border-top-left-radius: var(--radius--lg);
}

.last {
	border-bottom-right-radius: var(--radius--lg);
	border-bottom-left-radius: var(--radius--lg);
}

.content {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.line {
	padding: 0 6px;
	color: var(--color--foreground);
	font-size: var(--font-size--2xs);
}

.loading {
	width: 100%;
	background-color: var(--color--background--light-3);
}

.authorLink {
	cursor: pointer;

	&:hover {
		color: var(--color--primary);
		text-decoration: underline;
	}
}

.cardBody {
	min-width: 0;
	flex: 1;
}

.titleRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.creatorAvatar {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.creatorAvatarFallback {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	background-color: var(--color--foreground--tint-2);
	color: var(--color--text--tint-2);
	flex-shrink: 0;
}

.paidTag {
	--tag--color--background: var(--color--foreground--tint-1);
	--tag--border-color: var(--color--foreground);
	--tag--color--text: var(--color--text--tint-1);
}

.nodesContainer {
	min-width: 175px;
	display: flex;
	justify-content: flex-end;
	align-items: center;
	flex-grow: 1;
}
</style>
