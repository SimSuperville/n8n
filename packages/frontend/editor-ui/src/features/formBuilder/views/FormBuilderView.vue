<script setup lang="ts">
import { listFieldTypes } from '@n8n/form-core';
import { N8nFormRenderer } from '@n8n/forms';
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { N8nButton, N8nIcon, N8nIconButton, N8nText, N8nTooltip } from '@n8n/design-system';

import { VIEWS } from '@/app/constants';
import { useFormBuilder } from '../composables/useFormBuilder';
import BuilderInspector from '../components/BuilderInspector.vue';

const props = defineProps<{
	workflowId: string;
	nodeId: string;
}>();

const router = useRouter();
const builder = useFormBuilder(props.nodeId);

onMounted(() => {
	builder.load();
});

const paletteTypes = computed(() =>
	listFieldTypes().filter((descriptor) => descriptor.name !== 'hidden'),
);

const previewDefinition = computed(() => {
	const page = builder.selectedPage.value;
	if (!page?.definition) return null;
	const settings = builder.formSettings.value;
	if (settings && page.nodeId !== builder.pages[0]?.nodeId) {
		// Chained pages inherit the trigger's theme and layout, like the live renderer
		return { ...page.definition, theme: settings.theme, layout: settings.layout };
	}
	return page.definition;
});

const saveLabel = computed(() => {
	switch (builder.saveState.value) {
		case 'dirty':
			return 'Unsaved changes';
		case 'saving':
			return 'Saving…';
		default:
			return 'Saved to workflow';
	}
});

function goBack() {
	builder.saveNow();
	void router.push({ name: VIEWS.WORKFLOW, params: { name: props.workflowId } });
}

function pageLabel(index: number): string {
	const page = builder.pages[index];
	if (page.kind === 'completion') return 'Ending';
	const title = page.definition?.page.title ?? page.definition?.title;
	return title && title !== '' ? title : `Page ${index + 1}`;
}
</script>

<template>
	<div :class="$style.builder">
		<div :class="$style.topBar">
			<N8nButton type="tertiary" icon="arrow-left" size="small" text @click="goBack">
				Back to workflow
			</N8nButton>
			<N8nText v-if="builder.formSettings.value" bold size="medium">
				{{ builder.formSettings.value.title || 'Untitled form' }}
			</N8nText>
			<div :class="$style.topBarRight">
				<N8nText size="small" color="text-light">{{ saveLabel }}</N8nText>
				<N8nButton
					size="small"
					type="secondary"
					:disabled="builder.saveState.value === 'saved'"
					@click="builder.saveNow()"
				>
					Save
				</N8nButton>
			</div>
		</div>

		<div v-if="builder.loadError.value" :class="$style.error">
			<N8nText color="danger">{{ builder.loadError.value }}</N8nText>
		</div>

		<div v-else :class="$style.panes">
			<aside :class="$style.leftPane">
				<div :class="$style.sectionTitle">Add field</div>
				<div :class="$style.palette">
					<button
						v-for="descriptor in paletteTypes"
						:key="descriptor.name"
						:class="$style.paletteItem"
						type="button"
						:data-test-id="`form-builder-add-${descriptor.name}`"
						@click="builder.addElement(descriptor.name)"
					>
						{{ descriptor.label }}
					</button>
				</div>

				<div :class="$style.sectionTitle">Pages</div>
				<div :class="$style.pages">
					<div
						v-for="(page, index) in builder.pages"
						:key="page.nodeId"
						:class="[
							$style.pageItem,
							index === builder.selectedPageIndex.value ? $style.pageItemActive : '',
						]"
						@click="builder.selectPage(index)"
					>
						<span :class="$style.pageItemLabel">
							<N8nIcon
								:icon="page.kind === 'completion' ? 'circle-check' : 'file-text'"
								size="small"
							/>
							{{ pageLabel(index) }}
						</span>
						<N8nTooltip v-if="index > 0 && page.kind === 'page'" content="Delete page">
							<N8nIconButton
								icon="trash-2"
								type="tertiary"
								size="mini"
								text
								@click.stop="builder.removePage(page.nodeId)"
							/>
						</N8nTooltip>
					</div>
					<N8nButton type="tertiary" size="small" icon="plus" block @click="builder.addPage()">
						Add page
					</N8nButton>
				</div>
			</aside>

			<main :class="$style.canvas">
				<div v-if="builder.selectedPage.value?.kind === 'completion'" :class="$style.centerNote">
					<N8nText color="text-light">
						The form ending is configured on the node. Open it on the canvas to edit the completion
						screen.
					</N8nText>
				</div>
				<div v-else-if="builder.selectedPage.value?.issues.length" :class="$style.centerNote">
					<N8nText color="danger">
						This page's definition is invalid: {{ builder.selectedPage.value.issues.join('; ') }}
					</N8nText>
				</div>
				<N8nFormRenderer
					v-else-if="previewDefinition"
					:key="builder.selectedPage.value?.nodeId"
					:definition="previewDefinition"
					mode="preview"
					:selected-element-id="builder.selectedElementId.value"
					button-label="Submit"
					@element-select="builder.selectedElementId.value = $event"
				/>
			</main>

			<aside :class="$style.rightPane">
				<BuilderInspector :builder="builder" />
			</aside>
		</div>
	</div>
</template>

<style lang="scss" module>
.builder {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--color--background--light-2);
}

.topBar {
	display: flex;
	align-items: center;
	gap: var(--spacing--sm);
	padding: var(--spacing--2xs) var(--spacing--sm);
	border-bottom: var(--border);
	background: var(--color--background--light-3);
}

.topBarRight {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.error {
	padding: var(--spacing--lg);
}

.panes {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr) 300px;
	flex: 1;
	min-height: 0;
}

.leftPane,
.rightPane {
	background: var(--color--background--light-3);
	overflow-y: auto;
	padding: var(--spacing--xs);
}

.leftPane {
	border-right: var(--border);
}

.rightPane {
	border-left: var(--border);
}

.sectionTitle {
	font-size: var(--font-size--3xs);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color--text--tint-1);
	margin: var(--spacing--xs) 0 var(--spacing--3xs);
}

.palette {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--spacing--4xs);
}

.paletteItem {
	border: var(--border);
	border-radius: var(--radius);
	background: var(--color--background--light-2);
	padding: var(--spacing--3xs) var(--spacing--4xs);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: pointer;
	text-align: center;

	&:hover {
		border-color: var(--color--primary);
		color: var(--color--primary);
	}
}

.pages {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.pageItem {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--spacing--3xs) var(--spacing--2xs);
	border-radius: var(--radius);
	font-size: var(--font-size--2xs);
	cursor: pointer;

	&:hover {
		background: var(--color--background--light-2);
	}
}

.pageItemActive {
	background: var(--color--background--light-2);
	font-weight: var(--font-weight--bold);
}

.pageItemLabel {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.canvas {
	overflow-y: auto;
	padding: var(--spacing--lg);
}

.centerNote {
	display: flex;
	justify-content: center;
	padding: var(--spacing--2xl);
	text-align: center;
}
</style>
