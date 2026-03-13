<script setup lang="ts">
import uniqBy from 'lodash/uniqBy';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { type ITemplatesWorkflowFull } from '@n8n/rest-api-client';
import { useRecommendedTemplatesStore } from '../recommendedTemplates.store';
import { useRouter } from 'vue-router';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useI18n } from '@n8n/i18n';
import { N8nButton, N8nCard, N8nIcon, N8nTag, N8nText } from '@n8n/design-system';
import { VIEWS } from '@/app/constants';
import {
	keyFromCredentialTypeAndName,
	normalizeTemplateNodeCredentials,
} from '@/features/workflows/templates/utils/templateTransforms';
import { getNodeTypeDisplayableCredentials } from '@/app/utils/nodes/nodeTransforms';

const props = withDefaults(
	defineProps<{
		template: ITemplatesWorkflowFull;
		tileNumber?: number;
		showDetails?: boolean;
		clickable?: boolean;
	}>(),
	{
		clickable: false,
	},
);

const i18n = useI18n();
const nodeTypesStore = useNodeTypesStore();
const { getTemplateRoute, trackTemplateTileClick, trackTemplateShown } =
	useRecommendedTemplatesStore();
const router = useRouter();

const templateNodes = computed(() => {
	if (!props.template?.nodes) return [];

	const uniqueNodeTypes = uniqBy(props.template.nodes, (node) => node.icon).map(
		(node) => node.name,
	);
	const nodeTypesArray = Array.from(uniqueNodeTypes).slice(0, 2);

	return nodeTypesArray.map((nodeType) => nodeTypesStore.getNodeType(nodeType)).filter(Boolean);
});

const credentialsCount = computed(() => {
	const workflowNodes = props.template?.workflow?.nodes ?? [];
	if (workflowNodes.length === 0) return 0;

	const uniqueCredentialKeys = new Set<string>();

	for (const node of workflowNodes) {
		const requiredCredentials = getNodeTypeDisplayableCredentials(nodeTypesStore, node);
		if (requiredCredentials.length === 0) continue;

		const normalizedNodeCredentials = node.credentials
			? normalizeTemplateNodeCredentials(node.credentials)
			: {};

		for (const credentialDescription of requiredCredentials) {
			const credentialType = credentialDescription.name;
			const credentialName = normalizedNodeCredentials[credentialType] ?? '';
			const key = keyFromCredentialTypeAndName(credentialType, credentialName);
			uniqueCredentialKeys.add(key);
		}
	}

	return uniqueCredentialKeys.size;
});

const setupTimeMinutes = computed(() => {
	const BASE_TIME = 2; // minutes for importing/understanding
	const CREDENTIAL_TIME = 3; // minutes per credential

	return BASE_TIME + credentialsCount.value * CREDENTIAL_TIME;
});

const configuredCredentials = computed(() => {
	const total = credentialsCount.value;
	if (total === 0) return { configured: 0, total: 0 };
	const configured = Math.min((props.template.id * 3 + 1) % (total + 1), total);
	return { configured, total };
});

// Dummy social proof data
const isLiked = ref(false);
const isFollowed = ref(false);
const dummyLikes = 312;
const dummyDownloads = 1204;
const dummyViews = 5432;

// Dummy creator stats
const dummyTemplateCount = 24;
const dummyTotalViews = '183k';

function toggleFollow() {
	isFollowed.value = !isFollowed.value;
}

function toggleLike() {
	isLiked.value = !isLiked.value;
}

const hasTrackedShown = ref(false);
const cardRef = ref<InstanceType<typeof N8nCard> | null>(null);
let observer: IntersectionObserver | null = null;

const trackWhenVisible = () => {
	if (hasTrackedShown.value || props.tileNumber === undefined) {
		return;
	}

	hasTrackedShown.value = true;
	trackTemplateShown(props.template.id, props.tileNumber);
	if (observer && cardRef.value) {
		observer.unobserve(cardRef.value.$el);
	}
	observer = null;
};

const handleUseTemplate = async () => {
	if (!props.clickable) return;
	trackTemplateTileClick(props.template.id);
	await router.push(getTemplateRoute(props.template.id));
};

onMounted(() => {
	if (!cardRef.value) return;

	if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
		trackWhenVisible();
		return;
	}

	observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (entry.isIntersecting) {
				trackWhenVisible();
				break;
			}
		}
	});

	observer.observe(cardRef.value.$el);
});

onBeforeUnmount(() => {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
});
</script>

<template>
	<N8nCard
		ref="cardRef"
		:class="[$style.suggestion, { [$style.clickable]: clickable }]"
		@click="handleUseTemplate"
	>
		<div :class="$style.cardContent">
			<N8nText size="large" :bold="true" :class="$style.title">
				{{ template.name }}
			</N8nText>
			<div v-if="template.user" :class="$style.creatorBlock">
				<div :class="$style.creatorMain">
					<img
						v-if="template.user.avatar"
						:src="template.user.avatar"
						:alt="template.user.name"
						:class="$style.creatorAvatar"
					/>
					<N8nIcon v-else icon="user" :size="20" />
					<div :class="$style.creatorDetails">
						<div :class="$style.creatorNameRow">
							<N8nText size="medium" :bold="true">
								{{ template.user.name }}
							</N8nText>
							<span v-if="template.user.verified" :class="$style.verifiedBadge">
								<N8nIcon icon="shield-half" :size="14" />
							</span>
						</div>
						<N8nText size="small" color="text-light"> @{{ template.user.username }} </N8nText>
						<!-- TODO: add i18n key for creator stats -->
						<N8nText size="small" color="text-light" :class="$style.creatorStats">
							{{ dummyTemplateCount }} templates · {{ dummyTotalViews }} total views
						</N8nText>
					</div>
					<N8nButton
						:variant="isFollowed ? 'ghost' : 'outline'"
						size="small"
						:class="$style.followButton"
						data-testid="creator-follow-button"
						@click.stop="toggleFollow"
					>
						<!-- TODO: add i18n key for follow/following -->
						{{ isFollowed ? 'Following ✓' : 'Follow' }}
					</N8nButton>
				</div>
				<N8nText
					size="small"
					color="primary"
					:class="$style.creatorLink"
					data-testid="creator-view-all-link"
					@click.stop="
						router.push({
							name: VIEWS.TEMPLATE_CREATOR,
							params: { username: template.user.username },
						})
					"
				>
					{{ i18n.baseText('templates.creatorProfile.open') }} →
				</N8nText>
			</div>
			<div v-if="showDetails && template.categories?.length" :class="$style.categories">
				<N8nTag
					v-for="category in template.categories"
					:key="category.id"
					:text="category.name"
					:clickable="false"
					:class="$style.categoryTag"
				/>
			</div>
			<div :class="$style.socialProof" data-test-id="recommended-template-social-proof">
				<div :class="$style.socialDivider" />
				<div
					:class="[$style.socialRow, $style.likeRow, isLiked && $style.liked]"
					role="button"
					tabindex="0"
					:aria-label="
						isLiked ? i18n.baseText('templates.card.unlike') : i18n.baseText('templates.card.like')
					"
					data-test-id="recommended-template-like-button"
					@click.stop="toggleLike"
					@keydown.enter.stop="toggleLike"
				>
					<N8nIcon icon="thumbs-up" :size="14" />
					<N8nText size="small">{{ isLiked ? dummyLikes + 1 : dummyLikes }}</N8nText>
				</div>
				<div :class="$style.socialRow">
					<N8nIcon icon="download" :size="14" color="text-light" />
					<N8nText size="small" color="text-light">{{ dummyDownloads.toLocaleString() }}</N8nText>
				</div>
				<div :class="$style.socialRow">
					<N8nIcon icon="eye" :size="14" color="text-light" />
					<N8nText size="small" color="text-light">{{ dummyViews.toLocaleString() }}</N8nText>
				</div>
				<div :class="$style.socialDivider" />
			</div>
			<div :class="$style.statItem">
				<div :class="$style.statItemLeft">
					<div v-if="template.readyToDemo === true" :class="[$style.statItem, $style.mintGreen]">
						<N8nIcon icon="zap" :size="16" />
						<N8nText size="medium">
							{{ i18n.baseText('templates.card.readyToRun') }}
						</N8nText>
					</div>
					<div v-else :class="$style.statItem">
						<N8nIcon icon="clock" :size="16" />
						<N8nText size="medium">
							{{
								i18n.baseText('templates.card.setupTime', {
									interpolate: { count: setupTimeMinutes },
								})
							}}
						</N8nText>
					</div>
				</div>
				<div v-if="templateNodes.length > 0" :class="$style.nodes">
					<NodeIcon
						v-for="nodeType in templateNodes"
						:key="nodeType!.name"
						:size="20"
						:node-type="nodeType"
					/>
				</div>
			</div>
			<div v-if="configuredCredentials.total > 0" :class="$style.credentialsStatus">
				<N8nIcon icon="key" :size="16" />
				<N8nText size="medium">
					{{ configuredCredentials.configured }} / {{ configuredCredentials.total }} credentials
					configured
				</N8nText>
				<div :class="$style.credentialsBar">
					<div
						:class="$style.credentialsBarFill"
						:style="{
							width: `${(configuredCredentials.configured / configuredCredentials.total) * 100}%`,
						}"
					/>
				</div>
			</div>
			<div v-if="$slots.belowContent">
				<slot name="belowContent" />
			</div>
		</div>
	</N8nCard>
</template>

<style lang="scss" module>
.suggestion {
	display: flex;
	flex-direction: column;
	padding: var(--spacing--lg);
	justify-content: space-between;
	min-width: 200px;
	background-color: var(--color--background--light-3);
}

.clickable {
	cursor: pointer;

	&:hover {
		box-shadow: var(--shadow--card-hover);

		.title {
			color: var(--color--primary);
			text-decoration: underline;
		}
	}
}

.cardContent {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	flex: 1;
}

.nodes {
	display: flex;
	gap: var(--spacing--xs);
}

.statItemLeft {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	min-width: 0;
}

.creatorBlock {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
	margin-top: auto;
	padding-bottom: var(--spacing--xs);
	border-bottom: var(--border-width) var(--border-style) var(--color--foreground);
}

.creatorMain {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--2xs);
}

.creatorAvatar {
	width: var(--spacing--xl);
	height: var(--spacing--xl);
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}

.creatorDetails {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--5xs);
	min-width: 0;
	flex: 1;
}

.creatorNameRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
}

.verifiedBadge {
	display: flex;
	align-items: center;
	color: var(--color--primary);
}

.creatorStats {
	font-size: var(--font-size--2xs);
	line-height: var(--line-height--sm);
}

.followButton {
	flex-shrink: 0;
	align-self: flex-start;
	margin-left: auto;
}

.creatorLink {
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}

.categories {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs);
}

.categoryTag {
	--tag--height: var(--spacing--lg);
	--tag--border-color: transparent;
	--tag--padding: var(--spacing--4xs) var(--spacing--2xs);
}

.statItem {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--xs);
}

.mintGreen {
	color: var(--color--mint-700);
}

.credentialsStatus {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	flex-wrap: wrap;
	color: var(--color--text--tint-1);
}

.credentialsBar {
	width: 100%;
	height: 4px;
	background-color: var(--color--foreground);
	border-radius: var(--radius);
	overflow: hidden;
	margin-top: var(--spacing--4xs);
}

.credentialsBarFill {
	height: 100%;
	background-color: var(--color--success);
	border-radius: var(--radius);
	transition: width 0.3s ease;
}

.socialProof {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.socialDivider {
	height: var(--border-width);
	background-color: var(--color--foreground);
}

.socialRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.likeRow {
	cursor: pointer;
	border-radius: var(--radius);
	padding: var(--spacing--4xs) var(--spacing--2xs);
	margin: calc(-1 * var(--spacing--4xs)) calc(-1 * var(--spacing--2xs));
	transition: background-color 0.15s ease;

	&:hover {
		background-color: var(--color--foreground--tint-2);
	}
}

.liked {
	color: var(--color--primary);
}
</style>
