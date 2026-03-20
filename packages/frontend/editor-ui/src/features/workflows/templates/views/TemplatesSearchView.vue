<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TemplateFilters from '../components/TemplateFilters.vue';
import TemplateList from '../components/TemplateList.vue';
import TemplatePreviewCard from '../components/TemplatePreviewCard.vue';
import TemplatesView from './TemplatesView.vue';

import type { ITemplatesCategory } from '@n8n/rest-api-client/api/templates';
import type { IDataObject } from 'n8n-workflow';
import { CREATOR_HUB_URL, VIEWS } from '@/app/constants';
import { useSettingsStore } from '@/app/stores/settings.store';
import { useUsersStore } from '@/features/settings/users/users.store';
import { useTemplatesStore } from '@/features/workflows/templates/templates.store';
import { useToast } from '@/app/composables/useToast';
import { useDebounce } from '@/app/composables/useDebounce';
import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import { useI18n } from '@n8n/i18n';
import type { BaseTextKey } from '@n8n/i18n';
import { useRoute, onBeforeRouteLeave, useRouter } from 'vue-router';
import { useTelemetry } from '@/app/composables/useTelemetry';

import {
	N8nButton,
	N8nHeading,
	N8nIcon,
	N8nInput,
	N8nOption,
	N8nSelect,
	N8nText,
} from '@n8n/design-system';
interface ISearchEvent {
	search_string: string;
	workflow_results_count: number;
	collection_results_count: number;
	categories_applied: ITemplatesCategory[];
	wf_template_repo_session_id: string;
}

// Visual-only sort and filter controls
const sortBy = ref('mostDownloaded');
const sortOptions = [
	{ value: 'mostDownloaded', label: 'templates.sort.mostDownloaded' },
	{ value: 'topRated', label: 'templates.sort.topRated' },
	{ value: 'newest', label: 'templates.sort.newest' },
] as const;

// Integration selector state
const integrationCategories = [
	{
		id: 'chatModel',
		labelKey: 'templates.integrationSelector.chatModel' as const,
		icon: 'bot' as const,
		options: [
			{ id: 'openai', name: 'OpenAI', icon: 'brain' as const },
			{ id: 'gemini', name: 'Gemini', icon: 'gem' as const },
			{ id: 'anthropic', name: 'Anthropic', icon: 'anthropic' as const },
			{ id: 'groq', name: 'Groq', icon: 'zap' as const },
			{ id: 'ollama', name: 'Ollama', icon: 'server' as const },
		],
	},
	{
		id: 'email',
		labelKey: 'templates.integrationSelector.email' as const,
		icon: 'mail' as const,
		options: [
			{ id: 'gmail', name: 'Gmail', icon: 'mail' as const },
			{ id: 'outlook', name: 'Outlook', icon: 'inbox' as const },
		],
	},
	{
		id: 'documentStorage',
		labelKey: 'templates.integrationSelector.documentStorage' as const,
		icon: 'folder-open' as const,
		options: [
			{ id: 'notion', name: 'Notion', icon: 'book' as const },
			{ id: 'google-drive', name: 'Google Drive', icon: 'cloud' as const },
			{ id: 'google-sheets', name: 'Google Sheets', icon: 'table' as const },
			{ id: 'airtable', name: 'Airtable', icon: 'database' as const },
		],
	},
	{
		id: 'communication',
		labelKey: 'templates.integrationSelector.communication' as const,
		icon: 'messages-square' as const,
		options: [
			{ id: 'slack', name: 'Slack', icon: 'hash' as const },
			{ id: 'whatsapp', name: 'WhatsApp', icon: 'message-circle' as const },
			{ id: 'telegram', name: 'Telegram', icon: 'send' as const },
			{ id: 'discord', name: 'Discord', icon: 'globe' as const },
		],
	},
];

const selectedIntegrations = ref<Record<string, string[]>>({});
const showRecommended = ref(false);

const hasSelectedIntegrations = computed(() =>
	Object.values(selectedIntegrations.value).some((arr) => arr.length > 0),
);

function toggleIntegrationOption(categoryId: string, optionId: string) {
	if (!selectedIntegrations.value[categoryId]) {
		selectedIntegrations.value[categoryId] = [];
	}
	const idx = selectedIntegrations.value[categoryId].indexOf(optionId);
	if (idx === -1) {
		selectedIntegrations.value[categoryId].push(optionId);
	} else {
		selectedIntegrations.value[categoryId].splice(idx, 1);
	}
	showRecommended.value = false;
}

function onShowRecommended() {
	showRecommended.value = true;
	scrollTo(0);
}

const areCategoriesPrepopulated = ref(false);
const categories = ref<ITemplatesCategory[]>([]);
const loadingCategories = ref(true);
const loadingCollections = ref(true);
const loadingWorkflows = ref(true);
const search = ref('');
const searchEventToTrack = ref<ISearchEvent | null>(null);
const errorLoadingWorkflows = ref(false);

const { callDebounced } = useDebounce();
const toast = useToast();
const documentTitle = useDocumentTitle();

const settingsStore = useSettingsStore();
const templatesStore = useTemplatesStore();
const usersStore = useUsersStore();
const i18n = useI18n();
const route = useRoute();
const router = useRouter();
const telemetry = useTelemetry();

const createQueryObject = (categoryId: 'name' | 'id') => {
	// We are using category names for template search and ids for collection search
	return {
		categories: categories.value.map((category) =>
			categoryId === 'name' ? category.name : String(category.id),
		),
		search: search.value,
	};
};

const totalWorkflows = computed(() =>
	templatesStore.getSearchedWorkflowsTotal(createQueryObject('name')),
);

const workflows = computed(
	() => templatesStore.getSearchedWorkflows(createQueryObject('name')) ?? [],
);

const collections = computed(
	() => templatesStore.getSearchedCollections(createQueryObject('id')) ?? [],
);

const recommendedWorkflows = computed(() => workflows.value.slice(0, 6));

const endOfSearchMessage = computed(() => {
	if (loadingWorkflows.value) {
		return null;
	}
	if (!loadingCollections.value && workflows.value.length === 0 && collections.value.length === 0) {
		if (!settingsStore.isTemplatesEndpointReachable && errorLoadingWorkflows.value) {
			return i18n.baseText('templates.connectionWarning');
		}
		return i18n.baseText('templates.noSearchResults');
	}

	return null;
});

const updateQueryParam = (search: string, category: string) => {
	const query = Object.assign({}, route.query);

	if (category.length) {
		query.categories = category;
	} else {
		delete query.categories;
	}

	if (search.length) {
		query.search = search;
	} else {
		delete query.search;
	}

	void router.replace({ query });
};

const updateSearch = () => {
	updateQueryParam(search.value, categories.value.map((category) => category.id).join(','));
	void loadWorkflowsAndCollections(false);
};

const loadWorkflows = async () => {
	try {
		loadingWorkflows.value = true;
		await templatesStore.getWorkflows({
			search: search.value,
			categories: categories.value.map((category) => category.name),
		});
		errorLoadingWorkflows.value = false;
	} catch (e) {
		errorLoadingWorkflows.value = true;
	}

	loadingWorkflows.value = false;
};

const loadCollections = async () => {
	try {
		loadingCollections.value = true;
		await templatesStore.getCollections({
			categories: categories.value.map((category) => String(category.id)),
			search: search.value,
		});
	} catch (e) {}

	loadingCollections.value = false;
};

const updateSearchTracking = (search: string, categories: number[]) => {
	if (!search) {
		return;
	}
	if (searchEventToTrack.value && searchEventToTrack.value.search_string.length > search.length) {
		return;
	}

	searchEventToTrack.value = {
		search_string: search,
		workflow_results_count: workflows.value.length,
		collection_results_count: collections.value.length,
		categories_applied: categories.map((categoryId) =>
			templatesStore.getCategoryById(categoryId.toString()),
		) as ITemplatesCategory[],
		wf_template_repo_session_id: templatesStore.currentSessionId,
	};
};

const trackCategories = () => {
	if (categories.value.length) {
		telemetry.track('User changed template filters', {
			search_string: search.value,
			categories_applied: categories.value,
			wf_template_repo_session_id: templatesStore.currentSessionId,
		});
	}
};

const loadWorkflowsAndCollections = async (initialLoad: boolean) => {
	const _categories = [...categories.value];
	const _search = search.value;
	await Promise.all([loadWorkflows(), loadCollections()]);
	if (!initialLoad) {
		updateSearchTracking(
			_search,
			_categories.map((category) => category.id),
		);
	}
};

const navigateTo = (e: MouseEvent, page: string, id: number) => {
	if (e.metaKey || e.ctrlKey) {
		const route = router.resolve({ name: page, params: { id } });
		window.open(route.href, '_blank');
		return;
	} else {
		void router.push({ name: page, params: { id } });
	}
};

const onOpenTemplate = ({ event, id }: { event: MouseEvent; id: number }) => {
	navigateTo(event, VIEWS.TEMPLATE, id);
};

const trackSearch = () => {
	if (searchEventToTrack.value) {
		telemetry.track(
			'User searched workflow templates',
			searchEventToTrack.value as unknown as IDataObject,
		);
		searchEventToTrack.value = null;
	}
};

const onSearchInput = (searchText: string) => {
	loadingWorkflows.value = true;
	loadingCollections.value = true;
	search.value = searchText;
	void callDebounced(updateSearch, {
		debounceTime: 500,
		trailing: true,
	});

	if (searchText.length === 0) {
		trackSearch();
	}
};

const onCategorySelected = (selected: ITemplatesCategory) => {
	categories.value = categories.value.concat(selected);
	updateSearch();
	trackCategories();
};

const onCategoryUnselected = (selected: ITemplatesCategory) => {
	categories.value = categories.value.filter((category) => category.id !== selected.id);
	updateSearch();
	trackCategories();
};

const onCategoriesCleared = () => {
	categories.value = [];
	updateSearch();
};

const onLoadMore = async () => {
	if (workflows.value.length >= totalWorkflows.value) {
		return;
	}
	try {
		loadingWorkflows.value = true;
		await templatesStore.getMoreWorkflows({
			categories: categories.value.map((category) => category.name),
			search: search.value,
		});
	} catch (e) {
		toast.showMessage({
			title: 'Error',
			message: 'Could not load more workflows',
			type: 'error',
		});
	} finally {
		loadingWorkflows.value = false;
	}
};

const loadCategories = async () => {
	try {
		await templatesStore.getCategories();
	} catch (e) {}
	loadingCategories.value = false;
};

const scrollTo = (position: number, behavior: ScrollBehavior = 'smooth') => {
	setTimeout(() => {
		const contentArea = document.getElementById('content');
		if (contentArea) {
			contentArea.scrollTo({
				top: position,
				behavior,
			});
		}
	}, 0);
};

const restoreSearchFromRoute = () => {
	let shouldUpdateSearch = false;
	if (route.query.search && typeof route.query.search === 'string') {
		search.value = route.query.search;
		shouldUpdateSearch = true;
	}
	if (typeof route.query.categories === 'string' && route.query.categories.length) {
		const categoriesFromURL = route.query.categories.split(',');
		categories.value = templatesStore.allCategories.filter((category) =>
			categoriesFromURL.includes(category.id.toString()),
		);
		shouldUpdateSearch = true;
	}
	if (shouldUpdateSearch) {
		updateSearch();
		trackCategories();
		areCategoriesPrepopulated.value = true;
	}
};

onMounted(async () => {
	documentTitle.set('Templates');
	await loadCategories();
	void loadWorkflowsAndCollections(true);
	void usersStore.showPersonalizationSurvey();

	restoreSearchFromRoute();

	// Check if templates are enabled and check if the local templates store is available
	if (settingsStore.isTemplatesEnabled) {
		settingsStore.testTemplatesEndpoint().catch(() => {});
	}

	setTimeout(() => {
		// Check if there is scroll position saved in route and scroll to it
		const scrollOffset = route.meta?.scrollOffset;
		if (typeof scrollOffset === 'number' && scrollOffset > 0) {
			scrollTo(scrollOffset, 'auto');
		}
	}, 100);
});

onBeforeRouteLeave((_to, _from, next) => {
	const contentArea = document.getElementById('content');
	if (contentArea) {
		// When leaving this page, store current scroll position in route data
		route.meta?.setScrollPosition?.(contentArea.scrollTop);
	}

	trackSearch();
	next();
});

watch(workflows, (newWorkflows) => {
	if (newWorkflows.length === 0) {
		window.scrollTo(0, 0);
	}
});
</script>

<template>
	<TemplatesView>
		<template #header>
			<div :class="$style.wrapper">
				<div :class="$style.title">
					<N8nHeading tag="h1" size="2xlarge">
						{{ i18n.baseText('templates.heading') }}
					</N8nHeading>
				</div>
				<div :class="$style.button">
					<N8nButton
						variant="subtle"
						size="large"
						:href="CREATOR_HUB_URL"
						:label="i18n.baseText('templates.shareWorkflow')"
						target="_blank"
					/>
				</div>
			</div>
		</template>
		<template #content>
			<div :class="$style.contentWrapper">
				<div :class="$style.filters">
					<TemplateFilters
						:categories="templatesStore.allCategories"
						:sort-on-populate="areCategoriesPrepopulated"
						:selected="categories"
						:loading="loadingCategories"
						@clear="onCategoryUnselected"
						@clear-all="onCategoriesCleared"
						@select="onCategorySelected"
					/>
				</div>
				<div :class="$style.search">
					<!-- Integration Selector -->
					<div :class="$style.integrationSelector" data-test-id="integration-selector">
						<N8nHeading :bold="true" size="large">
							{{ i18n.baseText('templates.integrationSelector.heading' as BaseTextKey) }}
						</N8nHeading>
						<N8nText size="small" color="text-light">
							{{ i18n.baseText('templates.integrationSelector.subtitle' as BaseTextKey) }}
						</N8nText>
						<div :class="$style.integrationGrid">
							<div
								v-for="category in integrationCategories"
								:key="category.id"
								:class="$style.integrationCategory"
							>
								<div :class="$style.integrationCategoryHeader">
									<N8nIcon :icon="category.icon" size="medium" />
									<N8nText size="small" :bold="true">
										{{ i18n.baseText(category.labelKey as BaseTextKey) }}
									</N8nText>
								</div>
								<div :class="$style.integrationOptions">
									<button
										v-for="option in category.options"
										:key="option.id"
										:class="[
											$style.integrationChip,
											selectedIntegrations[category.id]?.includes(option.id) &&
												$style.integrationChipSelected,
										]"
										:data-test-id="`integration-chip-${option.id}`"
										@click="toggleIntegrationOption(category.id, option.id)"
									>
										<N8nIcon :icon="option.icon" size="small" />
										<N8nText size="small">{{ option.name }}</N8nText>
									</button>
								</div>
							</div>
						</div>
						<div v-if="hasSelectedIntegrations" :class="$style.integrationCta">
							<N8nButton
								size="large"
								:label="i18n.baseText('templates.integrationSelector.cta' as BaseTextKey)"
								data-test-id="show-recommended-cta"
								@click="onShowRecommended"
							/>
						</div>
					</div>
					<N8nInput
						:model-value="search"
						:placeholder="i18n.baseText('templates.searchPlaceholder')"
						clearable
						data-test-id="template-search-input"
						@update:model-value="onSearchInput"
						@blur="trackSearch"
					>
						<template #prefix>
							<N8nIcon icon="search" />
						</template>
					</N8nInput>
					<div :class="$style.controlsBar" data-test-id="templates-controls-bar">
						<div :class="$style.sortControl">
							<N8nText size="small" color="text-light">
								{{ i18n.baseText('templates.sort.label') }}
							</N8nText>
							<N8nSelect v-model="sortBy" size="medium" data-test-id="templates-sort-select">
								<N8nOption
									v-for="option in sortOptions"
									:key="option.value"
									:value="option.value"
									:label="i18n.baseText(option.label as BaseTextKey)"
								/>
							</N8nSelect>
						</div>
					</div>
					<div
						v-if="showRecommended && recommendedWorkflows.length > 0 && !search"
						:class="$style.recommendedSection"
						data-test-id="recommended-workflows-section"
					>
						<N8nHeading :bold="true" size="large">
							{{ i18n.baseText('templates.recommended.heading') }}
						</N8nHeading>
						<N8nText size="small" color="text-light">
							{{ i18n.baseText('templates.recommended.subtitle') }}
						</N8nText>
						<div :class="$style.recommendedGrid">
							<TemplatePreviewCard
								v-for="workflow in recommendedWorkflows"
								:key="workflow.id"
								:workflow="workflow"
								@click="(e) => onOpenTemplate({ event: e, id: workflow.id })"
							/>
						</div>
					</div>
					<TemplateList
						:infinite-scroll-enabled="true"
						:loading="loadingWorkflows"
						:workflows="workflows"
						:total-count="totalWorkflows"
						@load-more="onLoadMore"
						@open-template="onOpenTemplate"
					/>
					<div v-if="endOfSearchMessage" :class="$style.endText">
						<N8nText size="medium" color="text-base">
							<span v-n8n-html="endOfSearchMessage" />
						</N8nText>
					</div>
				</div>
			</div>
		</template>
	</TemplatesView>
</template>

<style lang="scss" module>
.wrapper {
	display: flex;
	justify-content: space-between;
}

.contentWrapper {
	display: flex;
	justify-content: space-between;

	@media (max-width: $breakpoint-xs) {
		flex-direction: column;
	}
}

.filters {
	width: 200px;
	margin-bottom: var(--spacing--xl);
	margin-right: var(--spacing--2xl);
}

.search {
	width: 100%;

	> * {
		margin-bottom: var(--spacing--lg);
	}

	@media (max-width: $breakpoint-xs) {
		padding-left: 0;
	}
}

.header {
	margin-bottom: var(--spacing--2xs);
}

.controlsBar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--spacing--xs) 0;
}

.sortControl {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.integrationSelector {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
	padding: var(--spacing--lg);
	border: var(--border);
	border-radius: var(--radius--lg);
	background-color: var(--color--background--light-3);
	margin-bottom: var(--spacing--lg);
}

.integrationGrid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: var(--spacing--sm);

	@media (max-width: $breakpoint-xs) {
		grid-template-columns: 1fr;
	}
}

.integrationCategory {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.integrationCategoryHeader {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	color: var(--color--text);
}

.integrationOptions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--4xs);
}

.integrationChip {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	padding: var(--spacing--4xs) var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--xl);
	background: var(--color--background--light-3);
	cursor: pointer;
	transition: all 0.15s ease;
	font-family: var(--font-family);

	&:hover {
		border-color: var(--color--primary--tint-1);
		background-color: var(--color--primary--tint-3);
	}
}

.integrationChipSelected {
	border-color: var(--color--primary);
	background-color: var(--color--primary--tint-3);
	color: var(--color--primary);
}

.integrationCta {
	display: flex;
	justify-content: center;
	padding-top: var(--spacing--xs);
}

.recommendedSection {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	margin-bottom: var(--spacing--xl);
}

.recommendedGrid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--spacing--sm);
	margin-top: var(--spacing--xs);

	@media (max-width: $breakpoint-sm) {
		grid-template-columns: repeat(2, 1fr);
	}

	@media (max-width: $breakpoint-xs) {
		grid-template-columns: 1fr;
	}
}
</style>
