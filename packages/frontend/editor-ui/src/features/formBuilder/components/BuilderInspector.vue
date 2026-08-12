<script setup lang="ts">
import { uid, type FormChoiceOption } from '@n8n/form-core';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useTelemetry } from '@n8n/composables/useTelemetry';
import { useToast } from '@n8n/composables/useToast';

import {
	N8nButton,
	N8nCollapsiblePanel,
	N8nIcon,
	N8nIconButton,
	N8nInput,
	N8nInputLabel,
	N8nOption,
	N8nRadioButtons,
	N8nSelect,
	N8nSwitch,
	N8nTabs,
	N8nText,
} from '@n8n/design-system';

import { DATA_TABLE_DETAILS } from '@/features/core/dataTable/constants';
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

const openSections = reactive({
	layout: true,
	theme: true,
	responses: true,
	typography: false,
	images: false,
});

// --- layout mode (moved here from the top bar) ---
const telemetry = useTelemetry();
const toast = useToast();

const layoutModeOptions = [
	{ label: 'Classic', value: 'classic' },
	{ label: 'One at a time', value: 'oneAtATime' },
];

const layoutMode = computed(() => settings.value?.layout.mode ?? 'classic');

function setLayoutMode(mode: string) {
	if (!settings.value) return;
	settings.value.layout.mode = mode as 'classic' | 'oneAtATime';
	telemetry.track('User changed form layout mode', { mode });
}

// --- corner radius (px slider; legacy documents may carry a named preset) ---
const RADIUS_PRESETS: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 12, pill: 16 };

const radiusPx = computed(() => {
	const radius = settings.value?.theme.radius;
	if (typeof radius === 'number') return radius;
	return RADIUS_PRESETS[radius ?? 'md'] ?? 8;
});

function setRadius(event: Event) {
	if (!settings.value) return;
	settings.value.theme.radius = Number((event.target as HTMLInputElement).value);
}

// --- WCAG AA contrast checks on the selected colors ---
function relativeLuminance(hex: string): number | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const [r, g, b] = [0, 2, 4]
		.map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255)
		.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(colorA: string, colorB: string): number | null {
	const luminanceA = relativeLuminance(colorA);
	const luminanceB = relativeLuminance(colorB);
	if (luminanceA === null || luminanceB === null) return null;
	const [lighter, darker] =
		luminanceA > luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA];
	return (lighter + 0.05) / (darker + 0.05);
}

const contrastWarnings = computed<string[]>(() => {
	const colors = settings.value?.theme.colors ?? {};
	const warnings: string[] = [];
	const textOnCard = contrastRatio(colors.text ?? '#555555', colors.surface ?? '#ffffff');
	if (textOnCard !== null && textOnCard < 4.5) {
		warnings.push(
			`Text on the card is ${textOnCard.toFixed(1)}:1 — below the 4.5:1 AA minimum for text`,
		);
	}
	const buttonText = contrastRatio('#ffffff', colors.primary ?? '#ff6d5a');
	if (buttonText !== null && buttonText < 3) {
		warnings.push(
			`White button text on the primary color is ${buttonText.toFixed(1)}:1 — below the 3:1 AA minimum for controls`,
		);
	}
	return warnings;
});

// --- image upload (stored as a data URI inside the definition) ---
const MAX_IMAGE_BYTES = 300 * 1024;
const imageFileInput = ref<HTMLInputElement | null>(null);
let pendingImageAssign: ((dataUri: string) => void) | null = null;

function pickImage(assign: (dataUri: string) => void) {
	pendingImageAssign = assign;
	imageFileInput.value?.click();
}

function onImagePicked(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	const assign = pendingImageAssign;
	pendingImageAssign = null;
	if (!file || !assign) return;
	if (file.size > MAX_IMAGE_BYTES) {
		toast.showError(
			new Error('The image is stored inside the workflow, so it must be under 300 KB'),
			'Image too large',
		);
		return;
	}
	const reader = new FileReader();
	reader.onload = () => {
		if (typeof reader.result === 'string') assign(reader.result);
	};
	reader.readAsDataURL(file);
}

function assignLogo(dataUri: string) {
	if (settings.value) settings.value.theme.logoUrl = dataUri;
}

function assignBackground(dataUri: string) {
	if (settings.value) settings.value.theme.backgroundImageUrl = dataUri;
}

function assignCover(dataUri: string) {
	if (layoutCover.value) layoutCover.value.imageUrl = dataUri;
}

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

// --- data table responses ---
const router = useRouter();
const dataTableBusy = ref(false);

const dataTableHref = computed(() => {
	const info = props.builder.dataTableInfo.value;
	const projectId = props.builder.dataTableProjectId.value;
	if (!info || projectId === undefined) return null;
	return router.resolve({ name: DATA_TABLE_DETAILS, params: { projectId, id: info.id } }).href;
});

async function onConnectDataTable() {
	dataTableBusy.value = true;
	try {
		const table = await props.builder.connectDataTable();
		if (table) {
			toast.showMessage({
				title: 'Data table created',
				message: `Responses will be saved to "${table.name}". A Data table node was added after the last page.`,
				type: 'success',
			});
		}
	} catch (error) {
		toast.showError(error, 'Could not create the data table');
	} finally {
		dataTableBusy.value = false;
	}
}

async function onSyncDataTable() {
	dataTableBusy.value = true;
	try {
		await props.builder.syncDataTable();
		toast.showMessage({
			title: 'Columns synced',
			message: 'The data table and its node now match the form fields.',
			type: 'success',
		});
	} catch (error) {
		toast.showError(error, 'Could not sync the data table');
	} finally {
		dataTableBusy.value = false;
	}
}
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

			<N8nCollapsiblePanel v-model="openSections.layout" title="Layout">
				<div :class="$style.sectionBody">
					<N8nRadioButtons
						size="small"
						:model-value="layoutMode"
						:options="layoutModeOptions"
						data-test-id="form-builder-layout-mode"
						@update:model-value="setLayoutMode"
					/>
				</div>
			</N8nCollapsiblePanel>

			<N8nCollapsiblePanel v-model="openSections.theme" title="Theme">
				<div :class="$style.sectionBody">
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
					<div
						v-for="warning in contrastWarnings"
						:key="warning"
						:class="$style.contrastWarning"
						data-test-id="form-builder-contrast-warning"
					>
						<N8nIcon icon="triangle-alert" size="small" />
						<N8nText size="xsmall" color="warning">{{ warning }}</N8nText>
					</div>
					<div :class="$style.row">
						<N8nInputLabel label="Corner radius" size="small">
							<div :class="$style.sliderRow">
								<input
									:class="$style.slider"
									type="range"
									min="0"
									max="24"
									step="1"
									:value="radiusPx"
									data-test-id="form-builder-radius-slider"
									@input="setRadius"
								/>
								<N8nText size="xsmall" color="text-light">{{ radiusPx }}px</N8nText>
							</div>
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
				</div>
			</N8nCollapsiblePanel>

			<N8nCollapsiblePanel v-model="openSections.responses" title="Responses">
				<div :class="$style.sectionBody">
					<template v-if="builder.dataTableState.value === 'none'">
						<N8nText size="xsmall" color="text-light">
							Store every submission as a row in an n8n Data Table — one column per field.
						</N8nText>
						<N8nButton
							type="secondary"
							size="small"
							icon="table"
							:loading="dataTableBusy"
							data-test-id="form-builder-connect-data-table"
							@click="onConnectDataTable"
						>
							Save responses to a Data Table
						</N8nButton>
					</template>
					<template v-else-if="builder.dataTableState.value === 'nodeMissing'">
						<N8nText size="xsmall" color="danger">
							The linked Data table node was removed from the canvas. Delete the storage link in the
							form JSON, or undo the node deletion.
						</N8nText>
					</template>
					<template v-else>
						<div :class="$style.dataTableCard" data-test-id="form-builder-data-table-card">
							<N8nIcon icon="table" :class="$style.dataTableIcon" />
							<div :class="$style.dataTableMeta">
								<N8nText size="small" bold>{{ builder.dataTableInfo.value?.name }}</N8nText>
								<N8nText
									v-if="builder.dataTableState.value === 'synced'"
									size="xsmall"
									color="success"
								>
									Connected — columns match the form fields
								</N8nText>
								<N8nText v-else size="xsmall" color="warning">
									Connected — fields changed since the table was linked
								</N8nText>
							</div>
							<a
								v-if="dataTableHref"
								:href="dataTableHref"
								target="_blank"
								rel="noopener noreferrer"
								title="Open data table in a new tab"
								data-test-id="form-builder-open-data-table"
							>
								<N8nIconButton icon="external-link" type="tertiary" size="small" text />
							</a>
						</div>
						<N8nButton
							v-if="builder.dataTableState.value === 'outOfSync'"
							type="secondary"
							size="small"
							:loading="dataTableBusy"
							data-test-id="form-builder-sync-data-table"
							@click="onSyncDataTable"
						>
							Sync columns
						</N8nButton>
					</template>
				</div>
			</N8nCollapsiblePanel>

			<N8nCollapsiblePanel v-model="openSections.typography" title="Typography">
				<div :class="$style.sectionBody">
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
				</div>
			</N8nCollapsiblePanel>

			<N8nCollapsiblePanel v-model="openSections.images" title="Images">
				<div :class="$style.sectionBody">
					<div :class="$style.row">
						<N8nInputLabel label="Logo" size="small">
							<div :class="$style.imageRow">
								<N8nInput v-model="settings.theme.logoUrl" size="small" placeholder="https://…" />
								<N8nIconButton
									icon="upload"
									type="secondary"
									size="small"
									title="Upload an image (max 300 KB)"
									@click="pickImage(assignLogo)"
								/>
							</div>
						</N8nInputLabel>
					</div>
					<div :class="$style.row">
						<N8nInputLabel
							label="Background image"
							size="small"
							tooltip-text="Shown behind the form card, covering the page"
						>
							<div :class="$style.imageRow">
								<N8nInput
									v-model="settings.theme.backgroundImageUrl"
									size="small"
									placeholder="https://…"
								/>
								<N8nIconButton
									icon="upload"
									type="secondary"
									size="small"
									title="Upload an image (max 300 KB)"
									@click="pickImage(assignBackground)"
								/>
							</div>
						</N8nInputLabel>
					</div>
					<div v-if="layoutCover" :class="$style.row">
						<N8nInputLabel
							label="Cover image"
							size="small"
							tooltip-text="A featured image shown as a banner above the form or beside it"
						>
							<div :class="$style.imageRow">
								<N8nInput v-model="layoutCover.imageUrl" size="small" placeholder="https://…" />
								<N8nIconButton
									icon="upload"
									type="secondary"
									size="small"
									title="Upload an image (max 300 KB)"
									@click="pickImage(assignCover)"
								/>
							</div>
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
				</div>
			</N8nCollapsiblePanel>

			<input
				ref="imageFileInput"
				type="file"
				accept="image/*"
				:class="$style.hiddenFileInput"
				@change="onImagePicked"
			/>
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

.sectionBody {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	padding: var(--spacing--3xs) var(--spacing--2xs) var(--spacing--2xs);
}

.contrastWarning {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--4xs);
	color: var(--color--warning);
}

.sliderRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.slider {
	flex: 1;
	accent-color: var(--color--primary);
}

.imageRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);

	> :first-child {
		flex: 1;
	}
}

.dataTableCard {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius);
	padding: var(--spacing--3xs) var(--spacing--2xs);
}

.dataTableIcon {
	color: var(--color--primary);
	flex-shrink: 0;
}

.dataTableMeta {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-width: 0;
}

.hiddenFileInput {
	display: none;
}
</style>
