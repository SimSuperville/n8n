<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import TemplatesView from './TemplatesView.vue';
import TemplatePreviewCard from '../components/TemplatePreviewCard.vue';
import { useTemplatesStore } from '../templates.store';
import { useRoute, useRouter } from 'vue-router';
import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import { VIEWS } from '@/app/constants';
import { abbreviateNumber } from '@/app/utils/typesUtils';
import { filterTemplateNodes } from '@/app/utils/nodeTypesUtils';
import NodeIcon from '@/app/components/NodeIcon.vue';
import type { ITemplatesWorkflow } from '@n8n/rest-api-client/api/templates';

import { N8nHeading, N8nButton, N8nIcon, N8nLoading, N8nTag, N8nText } from '@n8n/design-system';
import type { IconName } from '@n8n/design-system/components/N8nIcon/icons';

const templatesStore = useTemplatesStore();
const route = useRoute();
const router = useRouter();
const documentTitle = useDocumentTitle();

const loading = ref(true);
const isFollowed = ref(false);

const username = computed(() => {
	const param = route.params.username;
	return Array.isArray(param) ? param[0] : param;
});

const creatorWorkflows = computed<ITemplatesWorkflow[]>(() => {
	return Object.values(templatesStore.workflows).filter((w) => w.user?.username === username.value);
});

const creatorInfo = computed(() => {
	const first = creatorWorkflows.value[0];
	if (!first?.user) return null;
	return first.user;
});

const totalDownloads = computed(() =>
	creatorWorkflows.value.reduce((sum, w) => sum + (((w.id * 11 + 37) % 9901) + 100), 0),
);

const featuredTemplates = computed(() =>
	[...creatorWorkflows.value].sort((a, b) => (b.totalViews || 0) - (a.totalViews || 0)).slice(0, 3),
);

const allTemplates = computed(() => creatorWorkflows.value);

const dummySocialLinks: Array<{ icon: IconName; url: string; label: string }> = [
	{ icon: 'globe', url: '#', label: 'Website' },
	{ icon: 'mail', url: '#', label: 'Twitter' },
	{ icon: 'git-branch', url: '#', label: 'GitHub' },
];

function toggleFollow() {
	isFollowed.value = !isFollowed.value;
}

function onOpenTemplate(event: MouseEvent, id: number) {
	if (event.metaKey || event.ctrlKey) {
		const resolved = router.resolve({ name: VIEWS.TEMPLATE, params: { id } });
		window.open(resolved.href, '_blank');
	} else {
		void router.push({ name: VIEWS.TEMPLATE, params: { id } });
	}
}

function getDummyLikes(id: number) {
	return ((id * 7 + 13) % 4951) + 50;
}

function getDummyDownloads(id: number) {
	return ((id * 11 + 37) % 9901) + 100;
}

function isPaid(id: number) {
	return id % 17 === 0 || id % 23 === 0;
}

function getDummyPrice(id: number) {
	return `£${((id * 3 + 7) % 16) + 5}`;
}

onMounted(async () => {
	documentTitle.set(`Templates by ${username.value}`);
	try {
		await templatesStore.getWorkflows({ search: '', categories: [] });
	} catch {
		// templates may fail to load
	}
	loading.value = false;
});
</script>

<template>
	<TemplatesView :go-back-enabled="true" :full-width="true">
		<template #header>
			<div :class="$style.headerContent">
				<N8nHeading tag="h1" size="2xlarge">
					<template v-if="creatorInfo">{{ creatorInfo.name }}</template>
					<template v-else>{{ username }}</template>
				</N8nHeading>
			</div>
		</template>
		<template #content>
			<N8nLoading v-if="loading" :loading="true" :rows="5" variant="p" />
			<div v-else :class="$style.layout">
				<!-- Left sidebar: Creator profile (sticky) -->
				<aside :class="$style.sidebar">
					<div :class="$style.sidebarInner">
						<img
							v-if="creatorInfo?.avatar"
							:src="creatorInfo.avatar"
							:alt="creatorInfo.name"
							:class="$style.avatar"
						/>
						<div v-else :class="$style.avatarPlaceholder">
							<N8nIcon icon="user" :size="40" />
						</div>

						<div :class="$style.nameRow">
							<N8nHeading size="xlarge" :bold="true">
								{{ creatorInfo?.name || username }}
							</N8nHeading>
							<N8nIcon
								v-if="creatorInfo?.verified"
								icon="shield-half"
								:size="18"
								:class="$style.verified"
							/>
						</div>
						<N8nText size="medium" color="text-light"> @{{ username }} </N8nText>

						<N8nButton
							:variant="isFollowed ? 'ghost' : 'outline'"
							size="medium"
							:class="$style.followBtn"
							data-testid="creator-follow-button"
							@click="toggleFollow"
						>
							{{ isFollowed ? 'Following ✓' : 'Follow' }}
						</N8nButton>

						<!-- Stats -->
						<div :class="$style.statsSection">
							<div :class="$style.statItem">
								<N8nIcon icon="file-text" :size="16" :class="$style.statIcon" />
								<div :class="$style.statContent">
									<N8nText :bold="true" size="medium">
										{{ creatorWorkflows.length }}
									</N8nText>
									<N8nText size="small" color="text-light">Templates</N8nText>
								</div>
							</div>
							<div :class="$style.statItem">
								<N8nIcon icon="sparkles" :size="16" :class="$style.statIcon" />
								<div :class="$style.statContent">
									<N8nText :bold="true" size="medium"> 4.7 </N8nText>
									<N8nText size="small" color="text-light">Rating</N8nText>
								</div>
							</div>
							<div :class="$style.statItem">
								<N8nIcon icon="download" :size="16" :class="$style.statIcon" />
								<div :class="$style.statContent">
									<N8nText :bold="true" size="medium">
										{{ abbreviateNumber(totalDownloads) }}
									</N8nText>
									<N8nText size="small" color="text-light">Downloads</N8nText>
								</div>
							</div>
						</div>

						<!-- Social links -->
						<div :class="$style.socialLinks">
							<a
								v-for="link in dummySocialLinks"
								:key="link.icon"
								:href="link.url"
								:class="$style.socialLink"
								:aria-label="link.label"
								target="_blank"
								@click.prevent
							>
								<N8nIcon :icon="link.icon" :size="16" />
								<N8nText size="small">{{ link.label }}</N8nText>
							</a>
						</div>
					</div>
				</aside>

				<!-- Right content: Templates (scrollable) -->
				<main :class="$style.content">
					<!-- Featured templates as cards -->
					<div v-if="featuredTemplates.length > 0" :class="$style.section">
						<N8nHeading size="large" :bold="true" :class="$style.sectionTitle">
							Featured templates
						</N8nHeading>
						<div :class="$style.featuredGrid">
							<TemplatePreviewCard
								v-for="workflow in featuredTemplates"
								:key="workflow.id"
								:workflow="workflow"
								@click="(e) => onOpenTemplate(e, workflow.id)"
							/>
						</div>
					</div>

					<!-- All templates as list -->
					<div :class="$style.section">
						<N8nHeading size="large" :bold="true" :class="$style.sectionTitle">
							All templates
							<N8nText v-if="allTemplates.length" size="medium" color="text-light">
								({{ allTemplates.length }})
							</N8nText>
						</N8nHeading>
						<div :class="$style.templateList">
							<div
								v-for="workflow in allTemplates"
								:key="workflow.id"
								:class="$style.listItem"
								data-test-id="template-list-item"
								@click="(e) => onOpenTemplate(e, workflow.id)"
							>
								<div :class="$style.listItemNodes">
									<div
										v-for="node in filterTemplateNodes(workflow.nodes).slice(0, 4)"
										:key="node.name"
										:class="$style.listNodeIcon"
									>
										<NodeIcon :node-type="node" :size="20" />
									</div>
								</div>
								<div :class="$style.listItemBody">
									<N8nText :bold="true" size="medium" :class="$style.listItemTitle">
										{{ workflow.name }}
									</N8nText>
									<N8nText size="small" color="text-light">
										{{ filterTemplateNodes(workflow.nodes).length }} nodes
									</N8nText>
								</div>
								<div :class="$style.listItemStats">
									<N8nTag
										v-if="isPaid(workflow.id)"
										:text="getDummyPrice(workflow.id)"
										:class="$style.paidTag"
										:clickable="false"
									/>
									<span v-if="workflow.totalViews" :class="$style.listStat">
										<N8nIcon icon="eye" size="xsmall" />
										<N8nText size="small" color="text-light">
											{{ abbreviateNumber(workflow.totalViews) }}
										</N8nText>
									</span>
									<span :class="$style.listStat">
										<N8nIcon icon="thumbs-up" size="xsmall" />
										<N8nText size="small" color="text-light">
											{{ abbreviateNumber(getDummyLikes(workflow.id)) }}
										</N8nText>
									</span>
									<span :class="$style.listStat">
										<N8nIcon icon="download" size="xsmall" />
										<N8nText size="small" color="text-light">
											{{ abbreviateNumber(getDummyDownloads(workflow.id)) }}
										</N8nText>
									</span>
								</div>
							</div>
						</div>
						<div v-if="allTemplates.length === 0" :class="$style.empty">
							<N8nText size="medium" color="text-light">
								No templates found for this creator.
							</N8nText>
						</div>
					</div>
				</main>
			</div>
		</template>
	</TemplatesView>
</template>

<style lang="scss" module>
.headerContent {
	display: flex;
	align-items: center;
	padding: 0 var(--spacing--lg);
}

.layout {
	display: flex;
	gap: var(--spacing--2xl);
	padding: 0 var(--spacing--lg);
	min-height: 0;
}

.sidebar {
	flex: 0 0 280px;
	min-width: 0;
}

.sidebarInner {
	position: sticky;
	top: var(--spacing--lg);
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	padding: var(--spacing--lg) 0;
}

.avatar {
	width: 80px;
	height: 80px;
	border-radius: 50%;
	object-fit: cover;
}

.avatarPlaceholder {
	width: 80px;
	height: 80px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: var(--color--foreground--tint-2);
	color: var(--color--text--tint-2);
}

.nameRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	margin-top: var(--spacing--2xs);
}

.verified {
	color: var(--color--primary);
}

.followBtn {
	width: 100%;
	margin-top: var(--spacing--4xs);
}

.statsSection {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
	padding: var(--spacing--sm) 0;
	border-top: var(--border-width) var(--border-style) var(--color--foreground);
	border-bottom: var(--border-width) var(--border-style) var(--color--foreground);
}

.statItem {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
}

.statIcon {
	color: var(--color--text--tint-2);
	flex-shrink: 0;
}

.statContent {
	display: flex;
	align-items: baseline;
	gap: var(--spacing--4xs);
}

.socialLinks {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.socialLink {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	color: var(--color--text--tint-1);
	text-decoration: none;
	padding: var(--spacing--4xs) var(--spacing--2xs);
	border-radius: var(--radius);
	transition: background-color 0.15s ease;
	margin-left: calc(-1 * var(--spacing--2xs));

	&:hover {
		background-color: var(--color--foreground--tint-2);
		color: var(--color--primary);
	}
}

.content {
	flex: 1;
	min-width: 0;
	padding-bottom: var(--spacing--2xl);
}

.section {
	margin-bottom: var(--spacing--2xl);
}

.sectionTitle {
	margin-bottom: var(--spacing--sm);
}

.featuredGrid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--spacing--sm);

	@media (max-width: 1100px) {
		grid-template-columns: repeat(2, 1fr);
	}

	@media (max-width: 800px) {
		grid-template-columns: 1fr;
	}
}

/* All templates list */
.templateList {
	display: flex;
	flex-direction: column;
	border: var(--border);
	border-radius: var(--radius--lg);
	overflow: hidden;
}

.listItem {
	display: flex;
	align-items: center;
	gap: var(--spacing--sm);
	padding: var(--spacing--sm) var(--spacing--md);
	cursor: pointer;
	transition: background-color 0.15s ease;

	&:not(:last-child) {
		border-bottom: var(--border-width) var(--border-style) var(--color--foreground);
	}

	&:hover {
		background-color: var(--color--foreground--tint-2);

		.listItemTitle {
			color: var(--color--primary);
		}
	}
}

.listItemNodes {
	display: flex;
	gap: var(--spacing--4xs);
	flex-shrink: 0;
}

.listNodeIcon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border-radius: var(--radius);
	background-color: var(--color--background--light-3);
	border: var(--border);
}

.listItemBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--5xs, 2px);
}

.listItemTitle {
	transition: color 0.15s ease;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.listItemStats {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	flex-shrink: 0;
}

.listStat {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	color: var(--color--text--tint-2);
}

.paidTag {
	--tag--color--background: var(--color--foreground--tint-1);
	--tag--border-color: var(--color--foreground);
	--tag--color--text: var(--color--text--tint-1);
}

.empty {
	padding: var(--spacing--2xl);
	text-align: center;
}
</style>
