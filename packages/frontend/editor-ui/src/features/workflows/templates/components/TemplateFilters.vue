<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { ITemplatesCategory } from '@n8n/rest-api-client/api/templates';
import { useI18n } from '@n8n/i18n';

import { N8nCheckbox, N8nIcon, N8nInput, N8nLoading, N8nTag, N8nText } from '@n8n/design-system';
interface Props {
	categories?: ITemplatesCategory[];
	sortOnPopulate?: boolean;
	expandLimit?: number;
	loading?: boolean;
	selected?: ITemplatesCategory[];
}

const props = withDefaults(defineProps<Props>(), {
	categories: () => [],
	sortOnPopulate: false,
	expandLimit: 12,
	loading: false,
	selected: () => [],
});

const emit = defineEmits<{
	clearAll: [];
	select: [category: ITemplatesCategory];
	clear: [category: ITemplatesCategory];
}>();

const i18n = useI18n();

const collapsed = ref(true);
const sortedCategories = ref<ITemplatesCategory[]>([]);

// Integrations filter state
const selectedIntegrations = ref<string[]>([]);
const integrationSearch = ref('');
const hardcodedIntegrations = ['Slack', 'HubSpot', 'Gmail', 'OpenAI', 'Notion'];

const filteredIntegrations = computed(() => {
	if (!integrationSearch.value) return hardcodedIntegrations;
	return hardcodedIntegrations.filter((name) =>
		name.toLowerCase().includes(integrationSearch.value.toLowerCase()),
	);
});

function toggleIntegration(name: string) {
	const idx = selectedIntegrations.value.indexOf(name);
	if (idx === -1) {
		selectedIntegrations.value.push(name);
	} else {
		selectedIntegrations.value.splice(idx, 1);
	}
}

// Published filter state
const publishedFilter = ref('any');
const publishedOptions = [
	{ value: 'any', key: 'templates.filters.anyTime' },
	{ value: '30days', key: 'templates.filters.last30Days' },
	{ value: '6months', key: 'templates.filters.last6Months' },
	{ value: 'year', key: 'templates.filters.lastYear' },
] as const;

const allSelected = computed((): boolean => {
	return props.selected.length === 0;
});

function sortCategories() {
	if (!props.sortOnPopulate) {
		sortedCategories.value = props.categories;
	} else {
		const selected = props.selected || [];
		const selectedCategories = props.categories.filter((cat) => selected.includes(cat));
		const notSelectedCategories = props.categories.filter((cat) => !selected.includes(cat));
		sortedCategories.value = selectedCategories.concat(notSelectedCategories);
	}
}
function collapseAction() {
	collapsed.value = false;
}

function handleCheckboxChanged(value: boolean, selectedCategory: ITemplatesCategory) {
	if (value) {
		emit('select', selectedCategory);
	} else {
		emit('clear', selectedCategory);
	}
}

function isSelected(category: ITemplatesCategory) {
	return props.selected.includes(category);
}

function resetCategories() {
	emit('clearAll');
}

watch(
	() => props.sortOnPopulate,
	(value: boolean) => {
		if (value) {
			sortCategories();
		}
	},
	{
		immediate: true,
	},
);

watch(
	() => props.categories,
	(categories: ITemplatesCategory[]) => {
		if (categories.length > 0) {
			sortCategories();
		}
	},
	{
		immediate: true,
	},
);
</script>

<template>
	<div :class="$style.filters" class="template-filters" data-test-id="templates-filter-container">
		<div :class="$style.title" v-text="i18n.baseText('templates.categoriesHeading')" />
		<div v-if="loading" :class="$style.list">
			<N8nLoading :loading="loading" :rows="expandLimit" />
		</div>
		<ul v-if="!loading" :class="$style.categories">
			<li :class="$style.item" data-test-id="template-filter-all-categories">
				<N8nCheckbox
					:model-value="allSelected"
					:label="i18n.baseText('templates.allCategories')"
					@update:model-value="() => resetCategories()"
				/>
			</li>
			<li
				v-for="(category, index) in collapsed
					? sortedCategories.slice(0, expandLimit)
					: sortedCategories"
				:key="index"
				:class="$style.item"
				:data-test-id="`template-filter-${category.name.toLowerCase().replaceAll(' ', '-')}`"
			>
				<N8nCheckbox
					:model-value="isSelected(category)"
					:label="category.name"
					@update:model-value="(value: boolean) => handleCheckboxChanged(value, category)"
				/>
			</li>
		</ul>
		<div
			v-if="sortedCategories.length > expandLimit && collapsed && !loading"
			:class="$style.button"
			data-test-id="expand-categories-button"
			@click="collapseAction"
		>
			<N8nText size="small" color="primary">
				+ {{ `${sortedCategories.length - expandLimit} more` }}
			</N8nText>
		</div>

		<!-- Integrations filter -->
		<div :class="$style.section" data-test-id="templates-filter-integrations">
			<div :class="$style.title" v-text="i18n.baseText('templates.filters.integrations')" />
			<N8nInput
				v-model="integrationSearch"
				size="small"
				:placeholder="i18n.baseText('templates.filters.searchIntegrations')"
				clearable
				:class="$style.sectionInput"
				data-test-id="templates-filter-integrations-search"
			>
				<template #prefix>
					<N8nIcon icon="search" />
				</template>
			</N8nInput>
			<div :class="$style.integrationTags">
				<N8nTag
					v-for="name in filteredIntegrations"
					:key="name"
					:text="name"
					:class="[
						$style.integrationTag,
						selectedIntegrations.includes(name) && $style.integrationTagSelected,
					]"
					:data-test-id="`templates-filter-integration-${name.toLowerCase()}`"
					@click="toggleIntegration(name)"
				/>
			</div>
		</div>

		<!-- Published filter -->
		<div :class="$style.section" data-test-id="templates-filter-published">
			<div :class="$style.title" v-text="i18n.baseText('templates.filters.published')" />
			<ul :class="$style.publishedList">
				<li
					v-for="option in publishedOptions"
					:key="option.value"
					:class="[$style.publishedItem, publishedFilter === option.value && $style.publishedItemActive]"
					data-test-id="templates-filter-published-option"
					@click="publishedFilter = option.value"
				>
					<N8nText size="small" :color="publishedFilter === option.value ? 'primary' : 'text-base'">
						{{ i18n.baseText(option.key) }}
					</N8nText>
				</li>
			</ul>
		</div>
	</div>
</template>

<style lang="scss" module>
.title {
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

.categories {
	padding-top: var(--spacing--xs);
	list-style-type: none;
}

.item {
	margin-top: var(--spacing--xs);

	&:nth-child(1) {
		margin-top: 0;
	}
}

.button {
	padding-top: var(--spacing--2xs);
	cursor: pointer;
}

.section {
	margin-top: var(--spacing--lg);
}

.sectionInput {
	margin-top: var(--spacing--xs);
}

.integrationTags {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--4xs);
	margin-top: var(--spacing--xs);
}

.integrationTag {
	cursor: pointer;
}

.integrationTagSelected {
	--tag--color--background: var(--color--primary--tint-3);
	--tag--border-color: var(--color--primary);
	--tag--color--text: var(--color--primary);
}

.publishedList {
	list-style: none;
	padding-top: var(--spacing--xs);
}

.publishedItem {
	padding: var(--spacing--4xs) var(--spacing--2xs);
	cursor: pointer;
	border-radius: var(--radius);

	&:hover {
		background-color: var(--color--foreground--tint-2);
	}
}

.publishedItemActive {
	background-color: var(--color--primary--tint-3);
}
</style>

<style lang="scss">
.template-filters {
	.el-checkbox {
		display: flex;
		white-space: unset;
	}

	.el-checkbox__label {
		top: -2px;
		position: relative;
		font-size: var(--font-size--xs);
		line-height: var(--line-height--lg);
		color: var(--color--text--shade-1);
		padding-left: var(--spacing--2xs);
	}
}
</style>
