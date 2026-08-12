<script setup lang="ts">
import { uid, type FormChoiceOption } from '@n8n/form-core';
import { computed, ref } from 'vue';

import {
	N8nButton,
	N8nIconButton,
	N8nInput,
	N8nInputLabel,
	N8nOption,
	N8nSelect,
	N8nSwitch,
	N8nTabs,
	N8nText,
} from '@n8n/design-system';

import type { useFormBuilder } from '../composables/useFormBuilder';
import LogicSection from './LogicSection.vue';

const props = defineProps<{
	builder: ReturnType<typeof useFormBuilder>;
}>();

const activeTab = ref<'field' | 'settings'>('field');
const tabs = [
	{ value: 'field', label: 'Field' },
	{ value: 'settings', label: 'Settings' },
];

const element = computed(() => props.builder.selectedElement.value);
const settings = computed(() => props.builder.formSettings.value);
const pageDefinition = computed(() => props.builder.selectedPage.value?.definition ?? null);

const hasOptions = computed(() =>
	element.value ? ['dropdown', 'radio', 'checkbox'].includes(element.value.type) : false,
);

const elementConfig = computed(() => {
	const el = element.value;
	if (!el) return null;
	if (el.config === undefined) el.config = {};
	return el.config as Record<string, unknown>;
});

const options = computed<FormChoiceOption[]>(() => {
	const config = elementConfig.value;
	if (!config) return [];
	if (!Array.isArray(config.options)) config.options = [];
	return config.options as FormChoiceOption[];
});

function addOption() {
	options.value.push({ id: uid(), label: `Option ${options.value.length + 1}` });
}

function removeOption(id: string) {
	const index = options.value.findIndex((option) => option.id === id);
	if (index !== -1) options.value.splice(index, 1);
}

const themeColors = computed(() => {
	const theme = settings.value?.theme;
	if (!theme) return null;
	if (theme.colors === undefined) theme.colors = {};
	return theme.colors;
});

const themeFont = computed(() => {
	const theme = settings.value?.theme;
	if (!theme) return null;
	if (theme.font === undefined) theme.font = {};
	return theme.font;
});

const layoutCover = computed(() => {
	const layout = settings.value?.layout;
	if (!layout) return null;
	if (layout.cover === undefined) layout.cover = {};
	return layout.cover;
});

const radiusOptions = ['none', 'sm', 'md', 'lg', 'pill'] as const;
const widthOptions = ['narrow', 'default', 'wide'] as const;
const densityOptions = ['compact', 'default', 'relaxed'] as const;

// System font stacks only: the public form runs under a sandbox CSP that
// blocks external font hosts, so every option must resolve locally.
const fontOptions = [
	{ label: 'Default (Open Sans)', value: '' },
	{
		label: 'System UI',
		value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
	},
	{ label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Palatino (serif)', value: '"Palatino Linotype", Palatino, Georgia, serif' },
	{ label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
	{ label: 'Trebuchet MS', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
	{ label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
	{ label: 'Courier (mono)', value: '"Courier New", Courier, monospace' },
];

const coverPlacementOptions = [
	{ label: 'Banner (top of form)', value: 'none' },
	{ label: 'Left half', value: 'left' },
	{ label: 'Right half', value: 'right' },
];
</script>

<template>
	<div :class="$style.inspector">
		<N8nTabs v-model="activeTab" :options="tabs" size="small" />

		<template v-if="activeTab === 'field'">
			<div v-if="!element" :class="$style.empty">
				<N8nText size="small" color="text-light">
					Select a field in the preview to edit it, or add one from the palette.
				</N8nText>
			</div>

			<template v-else>
				<div :class="$style.row">
					<N8nInputLabel label="Label" size="small">
						<N8nInput v-model="element.label" size="small" />
					</N8nInputLabel>
				</div>
				<div :class="$style.row">
					<N8nInputLabel label="Description" size="small">
						<N8nInput v-model="element.description" size="small" />
					</N8nInputLabel>
				</div>
				<div
					v-if="
						![
							'radio',
							'checkbox',
							'dropdown',
							'file',
							'html',
							'date',
							'rating',
							'opinionScale',
							'yesNo',
							'statement',
						].includes(element.type)
					"
					:class="$style.row"
				>
					<N8nInputLabel label="Placeholder" size="small">
						<N8nInput v-model="element.placeholder" size="small" />
					</N8nInputLabel>
				</div>
				<div :class="$style.row">
					<N8nInputLabel
						label="Output key"
						size="small"
						tooltip-text="The key of this answer in the workflow output. Defaults to the label."
					>
						<N8nInput v-model="element.key" size="small" :placeholder="element.label" />
					</N8nInputLabel>
				</div>
				<div v-if="!['html', 'statement'].includes(element.type)" :class="$style.rowInline">
					<N8nText size="small">Required</N8nText>
					<N8nSwitch v-model="element.required" size="small" />
				</div>

				<template v-if="hasOptions">
					<div :class="$style.sectionTitle">Options</div>
					<div v-for="option in options" :key="option.id" :class="$style.optionRow">
						<N8nInput v-model="option.label" size="small" />
						<N8nIconButton
							icon="trash-2"
							type="tertiary"
							size="small"
							text
							@click="removeOption(option.id)"
						/>
					</div>
					<N8nButton type="tertiary" size="small" icon="plus" @click="addOption">
						Add option
					</N8nButton>
					<div v-if="element.type === 'dropdown'" :class="$style.rowInline">
						<N8nText size="small">Multiple selection</N8nText>
						<N8nSwitch
							:model-value="elementConfig?.multiple === true"
							size="small"
							@update:model-value="elementConfig && (elementConfig.multiple = $event)"
						/>
					</div>
				</template>

				<template v-if="element.type === 'number' && elementConfig">
					<div :class="$style.rowSplit">
						<N8nInputLabel label="Min" size="small">
							<N8nInput
								:model-value="(elementConfig.min as number | undefined)?.toString() ?? ''"
								size="small"
								type="number"
								@update:model-value="elementConfig.min = $event === '' ? undefined : Number($event)"
							/>
						</N8nInputLabel>
						<N8nInputLabel label="Max" size="small">
							<N8nInput
								:model-value="(elementConfig.max as number | undefined)?.toString() ?? ''"
								size="small"
								type="number"
								@update:model-value="elementConfig.max = $event === '' ? undefined : Number($event)"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<template v-if="['rating', 'opinionScale'].includes(element.type) && elementConfig">
					<div v-if="element.type === 'rating'" :class="$style.row">
						<N8nInputLabel label="Style" size="small">
							<N8nSelect
								:model-value="(elementConfig.style as string | undefined) ?? 'scale'"
								size="small"
								@update:model-value="elementConfig.style = $event"
							>
								<N8nOption value="scale" label="Number scale" />
								<N8nOption value="stars" label="Stars" />
							</N8nSelect>
						</N8nInputLabel>
					</div>
					<div :class="$style.row">
						<N8nInputLabel label="Steps up to" size="small">
							<N8nInput
								:model-value="
									(elementConfig.max as number | undefined)?.toString() ??
									(element.type === 'opinionScale' ? '10' : '5')
								"
								size="small"
								type="number"
								@update:model-value="elementConfig.max = $event === '' ? undefined : Number($event)"
							/>
						</N8nInputLabel>
					</div>
					<div :class="$style.rowSplit">
						<N8nInputLabel label="Low label" size="small">
							<N8nInput
								:model-value="(elementConfig.lowLabel as string | undefined) ?? ''"
								size="small"
								placeholder="Poor"
								@update:model-value="elementConfig.lowLabel = $event"
							/>
						</N8nInputLabel>
						<N8nInputLabel label="High label" size="small">
							<N8nInput
								:model-value="(elementConfig.highLabel as string | undefined) ?? ''"
								size="small"
								placeholder="Excellent"
								@update:model-value="elementConfig.highLabel = $event"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<template v-if="element.type === 'file' && elementConfig">
					<div :class="$style.rowInline">
						<N8nText size="small">Multiple files</N8nText>
						<N8nSwitch
							:model-value="elementConfig.multiple !== false"
							size="small"
							@update:model-value="elementConfig.multiple = $event"
						/>
					</div>
					<div :class="$style.row">
						<N8nInputLabel label="Allowed file types" size="small">
							<N8nInput
								:model-value="(elementConfig.acceptFileTypes as string | undefined) ?? ''"
								size="small"
								placeholder=".pdf, .png"
								@update:model-value="elementConfig.acceptFileTypes = $event"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<template v-if="element.type === 'yesNo' && elementConfig">
					<div :class="$style.rowSplit">
						<N8nInputLabel label="Yes label" size="small">
							<N8nInput
								:model-value="(elementConfig.yesLabel as string | undefined) ?? ''"
								size="small"
								placeholder="Yes"
								@update:model-value="elementConfig.yesLabel = $event"
							/>
						</N8nInputLabel>
						<N8nInputLabel label="No label" size="small">
							<N8nInput
								:model-value="(elementConfig.noLabel as string | undefined) ?? ''"
								size="small"
								placeholder="No"
								@update:model-value="elementConfig.noLabel = $event"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<template v-if="element.type === 'statement' && elementConfig">
					<div :class="$style.row">
						<N8nInputLabel label="Text" size="small">
							<N8nInput
								:model-value="(elementConfig.text as string | undefined) ?? ''"
								size="small"
								type="textarea"
								:rows="4"
								@update:model-value="elementConfig.text = $event"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<template v-if="element.type === 'html' && elementConfig">
					<div :class="$style.row">
						<N8nInputLabel label="HTML content" size="small">
							<N8nInput
								:model-value="(elementConfig.html as string | undefined) ?? ''"
								size="small"
								type="textarea"
								:rows="5"
								@update:model-value="elementConfig.html = $event"
							/>
						</N8nInputLabel>
					</div>
				</template>

				<LogicSection :builder="builder" :element="element" />

				<div :class="$style.actions">
					<N8nButton
						type="tertiary"
						size="small"
						icon="arrow-up"
						square
						@click="builder.moveElement(element.id, -1)"
					/>
					<N8nButton
						type="tertiary"
						size="small"
						icon="arrow-down"
						square
						@click="builder.moveElement(element.id, 1)"
					/>
					<N8nButton
						type="tertiary"
						size="small"
						icon="copy"
						@click="builder.duplicateElement(element.id)"
					>
						Duplicate
					</N8nButton>
					<N8nButton
						type="tertiary"
						size="small"
						icon="trash-2"
						@click="builder.removeElement(element.id)"
					>
						Delete
					</N8nButton>
				</div>
			</template>
		</template>

		<template v-else-if="activeTab === 'settings' && settings">
			<div :class="$style.row">
				<N8nInputLabel label="Form title" size="small">
					<N8nInput v-model="settings.title" size="small" />
				</N8nInputLabel>
			</div>
			<div :class="$style.row">
				<N8nInputLabel label="Form description" size="small">
					<N8nInput v-model="settings.description" size="small" type="textarea" :rows="2" />
				</N8nInputLabel>
			</div>
			<div v-if="pageDefinition && pageDefinition !== settings" :class="$style.row">
				<N8nInputLabel label="This page's title" size="small">
					<N8nInput v-model="pageDefinition.title" size="small" />
				</N8nInputLabel>
			</div>

			<div :class="$style.sectionTitle">Theme</div>
			<div v-if="themeColors" :class="$style.rowSplit">
				<N8nInputLabel label="Primary color" size="small">
					<input v-model="themeColors.primary" :class="$style.colorInput" type="color" />
				</N8nInputLabel>
				<N8nInputLabel label="Background" size="small">
					<input v-model="themeColors.background" :class="$style.colorInput" type="color" />
				</N8nInputLabel>
			</div>
			<div v-if="themeColors" :class="$style.rowSplit">
				<N8nInputLabel label="Card color" size="small">
					<input v-model="themeColors.surface" :class="$style.colorInput" type="color" />
				</N8nInputLabel>
				<N8nInputLabel label="Text color" size="small">
					<input v-model="themeColors.text" :class="$style.colorInput" type="color" />
				</N8nInputLabel>
			</div>
			<div :class="$style.row">
				<N8nInputLabel label="Corner radius" size="small">
					<N8nSelect
						:model-value="settings.theme.radius ?? 'md'"
						size="small"
						@update:model-value="settings.theme.radius = $event"
					>
						<N8nOption
							v-for="option in radiusOptions"
							:key="option"
							:value="option"
							:label="option"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>
			<div :class="$style.row">
				<N8nInputLabel label="Button style" size="small">
					<N8nSelect
						:model-value="settings.theme.buttonStyle ?? 'solid'"
						size="small"
						@update:model-value="settings.theme.buttonStyle = $event"
					>
						<N8nOption value="solid" label="Solid" />
						<N8nOption value="outline" label="Outline" />
					</N8nSelect>
				</N8nInputLabel>
			</div>

			<div :class="$style.sectionTitle">Typography</div>
			<div v-if="themeFont" :class="$style.row">
				<N8nInputLabel label="Font" size="small">
					<N8nSelect
						:model-value="themeFont.family ?? ''"
						size="small"
						@update:model-value="themeFont.family = $event === '' ? undefined : $event"
					>
						<N8nOption
							v-for="option in fontOptions"
							:key="option.label"
							:value="option.value"
							:label="option.label"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>
			<div v-if="themeFont" :class="$style.row">
				<N8nInputLabel
					label="Heading font"
					size="small"
					tooltip-text="Used for the form title and question labels. Defaults to the body font."
				>
					<N8nSelect
						:model-value="themeFont.headingFamily ?? ''"
						size="small"
						@update:model-value="themeFont.headingFamily = $event === '' ? undefined : $event"
					>
						<N8nOption
							v-for="option in fontOptions"
							:key="option.label"
							:value="option.value"
							:label="option.label"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>

			<div :class="$style.sectionTitle">Layout</div>
			<div :class="$style.row">
				<N8nInputLabel label="Container width" size="small">
					<N8nSelect
						:model-value="settings.layout.containerWidth ?? 'default'"
						size="small"
						@update:model-value="settings.layout.containerWidth = $event"
					>
						<N8nOption
							v-for="option in widthOptions"
							:key="option"
							:value="option"
							:label="option"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>
			<div :class="$style.row">
				<N8nInputLabel
					label="Density"
					size="small"
					tooltip-text="Spacing between fields and around the form card"
				>
					<N8nSelect
						:model-value="settings.layout.density ?? 'default'"
						size="small"
						@update:model-value="settings.layout.density = $event"
					>
						<N8nOption
							v-for="option in densityOptions"
							:key="option"
							:value="option"
							:label="option"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>

			<div :class="$style.sectionTitle">Images</div>
			<div :class="$style.row">
				<N8nInputLabel label="Logo URL" size="small">
					<N8nInput v-model="settings.theme.logoUrl" size="small" placeholder="https://…" />
				</N8nInputLabel>
			</div>
			<div :class="$style.row">
				<N8nInputLabel
					label="Background image URL"
					size="small"
					tooltip-text="Shown behind the form card, covering the page"
				>
					<N8nInput
						v-model="settings.theme.backgroundImageUrl"
						size="small"
						placeholder="https://…"
					/>
				</N8nInputLabel>
			</div>
			<div v-if="layoutCover" :class="$style.row">
				<N8nInputLabel
					label="Cover image URL"
					size="small"
					tooltip-text="A featured image shown as a banner above the form or beside it"
				>
					<N8nInput v-model="layoutCover.imageUrl" size="small" placeholder="https://…" />
				</N8nInputLabel>
			</div>
			<div v-if="layoutCover && layoutCover.imageUrl" :class="$style.row">
				<N8nInputLabel label="Cover placement" size="small">
					<N8nSelect
						:model-value="layoutCover.split ?? 'none'"
						size="small"
						@update:model-value="layoutCover.split = $event"
					>
						<N8nOption
							v-for="option in coverPlacementOptions"
							:key="option.value"
							:value="option.value"
							:label="option.label"
						/>
					</N8nSelect>
				</N8nInputLabel>
			</div>
		</template>
	</div>
</template>

<style lang="scss" module>
.inspector {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.empty {
	padding: var(--spacing--sm) 0;
}

.row {
	display: flex;
	flex-direction: column;
}

.rowInline {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--spacing--4xs) 0;
}

.rowSplit {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--spacing--2xs);
}

.sectionTitle {
	font-size: var(--font-size--3xs);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color--text--tint-1);
	margin-top: var(--spacing--xs);
}

.optionRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
}

.actions {
	display: flex;
	gap: var(--spacing--4xs);
	margin-top: var(--spacing--xs);
	padding-top: var(--spacing--xs);
	border-top: var(--border);
	flex-wrap: wrap;
}

.colorInput {
	width: 100%;
	height: 30px;
	border: var(--border);
	border-radius: var(--radius);
	padding: 2px;
	background: transparent;
}
</style>
