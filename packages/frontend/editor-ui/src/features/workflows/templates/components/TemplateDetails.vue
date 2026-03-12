<script setup lang="ts">
import TemplateDetailsBlock from './TemplateDetailsBlock.vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { filterTemplateNodes } from '@/app/utils/nodeTypesUtils';
import { abbreviateNumber } from '@/app/utils/typesUtils';
import type {
	ITemplatesCollection,
	ITemplatesCollectionFull,
	ITemplatesNode,
	ITemplatesWorkflow,
} from '@n8n/rest-api-client/api/templates';
import type { ITag } from '@n8n/rest-api-client/api/tags';
import { useTemplatesStore } from '../templates.store';
import TimeAgo from '@/app/components/TimeAgo.vue';
import { isFullTemplatesCollection, isTemplatesWorkflow } from '../utils/typeGuards';
import { useRouter } from 'vue-router';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';
import { VIEWS } from '@/app/constants';

import { N8nIcon, N8nLoading, N8nTags, N8nText } from '@n8n/design-system';
const props = defineProps<{
	template: ITemplatesWorkflow | ITemplatesCollection | ITemplatesCollectionFull | null;
	blockTitle: string;
	loading: boolean;
}>();

const router = useRouter();
const i18n = useI18n();

const templatesStore = useTemplatesStore();

const categoriesAsTags = computed<ITag[]>(() =>
	props.template && 'categories' in props.template
		? props.template.categories.map((category) => ({
				id: `${category.id}`,
				name: category.name,
			}))
		: [],
);

const redirectToCategory = (id: string) => {
	templatesStore.resetSessionId();
	void router.push(`/templates?categories=${id}`);
};

const redirectToSearchPage = (node: ITemplatesNode) => {
	templatesStore.resetSessionId();
	void router.push(`/templates?search=${node.displayName}`);
};

const navigateToCreator = () => {
	if (props.template && isTemplatesWorkflow(props.template) && props.template.user) {
		void router.push({
			name: VIEWS.TEMPLATE_CREATOR,
			params: { username: props.template.user.username },
		});
	}
};
</script>

<template>
	<div>
		<N8nLoading :loading="loading" :rows="5" variant="p" />

		<TemplateDetailsBlock
			v-if="!loading && template && template.nodes.length > 0"
			:title="blockTitle"
		>
			<div :class="$style.icons">
				<div
					v-for="node in filterTemplateNodes(template.nodes)"
					:key="node.name"
					:class="$style.icon"
				>
					<NodeIcon
						:node-type="node"
						:size="24"
						:show-tooltip="true"
						@click="redirectToSearchPage(node)"
					/>
				</div>
			</div>
		</TemplateDetailsBlock>

		<TemplateDetailsBlock
			v-if="!loading && isFullTemplatesCollection(template) && categoriesAsTags.length > 0"
			:title="i18n.baseText('template.details.categories')"
		>
			<N8nTags :tags="categoriesAsTags" @click:tag="redirectToCategory" />
		</TemplateDetailsBlock>

		<TemplateDetailsBlock
			v-if="!loading && template"
			:title="i18n.baseText('template.details.details')"
		>
			<div :class="$style.text">
				<N8nText v-if="isTemplatesWorkflow(template)" size="small" color="text-base">
					{{ i18n.baseText('template.details.created') }}
					<TimeAgo :date="template.createdAt" />
					{{ i18n.baseText('template.details.by') }}
				</N8nText>
				<!-- TODO: add i18n key for creator chip -->
				<span
					v-if="isTemplatesWorkflow(template) && template.user"
					:class="$style.creatorChip"
					data-testid="template-creator-chip"
					@click="navigateToCreator"
				>
					<img
						:src="template.user.avatar || 'https://i.pravatar.cc/24'"
						:alt="template.user.name"
						:class="$style.chipAvatar"
					/>
					<N8nText size="small" :bold="true">
						{{ template.user.name }}
					</N8nText>
					<N8nIcon
						v-if="template.user.verified"
						icon="shield-half"
						:size="12"
						:class="$style.chipVerified"
					/>
				</span>
				<N8nText v-else-if="isTemplatesWorkflow(template)" size="small" color="text-base">
					n8n team
				</N8nText>
			</div>
			<div :class="$style.text">
				<N8nText
					v-if="isTemplatesWorkflow(template) && template.totalViews !== 0"
					size="small"
					color="text-base"
				>
					{{ i18n.baseText('template.details.viewed') }}
					{{ abbreviateNumber(template.totalViews) }}
					{{ i18n.baseText('template.details.times') }}
				</N8nText>
			</div>
		</TemplateDetailsBlock>
	</div>
</template>

<style lang="scss" module>
.icons {
	display: flex;
	flex-wrap: wrap;
}
.icon {
	margin-right: var(--spacing--xs);
	margin-bottom: var(--spacing--xs);
	cursor: pointer;
}
.text {
	padding-bottom: var(--spacing--xs);
}

.creatorChip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
	padding: var(--spacing--5xs) var(--spacing--2xs);
	border-radius: var(--radius--xl);
	cursor: pointer;
	transition: background-color 0.15s ease;
	vertical-align: middle;

	&:hover {
		background-color: var(--color--foreground--tint-2);
	}
}

.chipAvatar {
	width: var(--spacing--lg);
	height: var(--spacing--lg);
	border-radius: 50%;
	object-fit: cover;
}

.chipVerified {
	color: var(--color--primary);
}
</style>
