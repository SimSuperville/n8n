<script setup lang="ts">
import { ref } from 'vue';

import { useToast } from '@n8n/composables/useToast';

import { N8nButton, N8nIconButton, N8nInput, N8nText, N8nTooltip } from '@n8n/design-system';

/**
 * Compact image control: an icon box that expands to an upload-first panel.
 * Uploads are stored as data URIs inside the form definition (300 KB cap);
 * pasting a URL is the secondary option.
 */
defineProps<{
	modelValue?: string;
	/** Shown in the tooltip and the expanded panel heading */
	label: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string | undefined];
}>();

const MAX_IMAGE_BYTES = 300 * 1024;

const toast = useToast();
const expanded = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onFilePicked(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	if (file.size > MAX_IMAGE_BYTES) {
		toast.showError(
			new Error('The image is stored inside the workflow, so it must be under 300 KB'),
			'Image too large',
		);
		return;
	}
	const reader = new FileReader();
	reader.onload = () => {
		if (typeof reader.result === 'string') {
			emit('update:modelValue', reader.result);
			expanded.value = false;
		}
	};
	reader.readAsDataURL(file);
}

function onUrlInput(value: string) {
	emit('update:modelValue', value === '' ? undefined : value);
}

function clearImage() {
	emit('update:modelValue', undefined);
	expanded.value = false;
}
</script>

<template>
	<div :class="$style.picker">
		<N8nTooltip :content="label">
			<button
				type="button"
				:class="[$style.iconBox, { [$style.iconBoxActive]: expanded || Boolean(modelValue) }]"
				:data-test-id="`form-builder-image-picker-${label.toLowerCase().replace(/\s+/g, '-')}`"
				@click="expanded = !expanded"
			>
				<img v-if="modelValue" :class="$style.thumb" :src="modelValue" alt="" />
				<N8nIconButton v-else icon="image" type="tertiary" size="small" text tabindex="-1" />
			</button>
		</N8nTooltip>

		<div v-if="expanded" :class="$style.panel">
			<N8nText size="xsmall" bold>{{ label }}</N8nText>
			<N8nButton type="secondary" size="small" icon="upload" @click="fileInput?.click()">
				Upload image
			</N8nButton>
			<N8nInput
				:model-value="modelValue?.startsWith('data:') ? '' : (modelValue ?? '')"
				size="small"
				placeholder="…or paste an image URL"
				@update:model-value="onUrlInput"
			/>
			<N8nButton v-if="modelValue" type="tertiary" size="small" icon="trash-2" @click="clearImage">
				Remove
			</N8nButton>
			<input
				ref="fileInput"
				type="file"
				accept="image/*"
				:class="$style.hiddenInput"
				@change="onFilePicked"
			/>
		</div>
	</div>
</template>

<style lang="scss" module>
/* Static on purpose: the panel anchors to the nearest positioned ancestor
	(the inspector's section body), so it spans the pane instead of clipping */
.picker {
	display: inline-flex;
}

.iconBox {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 38px;
	height: 30px;
	border: var(--border);
	border-radius: var(--radius);
	background: var(--color--background--light-2);
	cursor: pointer;
	padding: 0;
	overflow: hidden;

	&:hover {
		border-color: var(--color--primary);
	}
}

.iconBoxActive {
	border-color: var(--color--primary);
}

.thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.panel {
	/* No top/left: keeps the natural (below the trigger) vertical position
		while `right` snaps the panel to the positioned ancestor's edge */
	position: absolute;
	right: 0;
	z-index: 10;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--3xs);
	width: 100%;
	margin-top: 4px;
	border: var(--border);
	border-radius: var(--radius);
	background: var(--color--background--light-3);
	box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
	padding: var(--spacing--2xs);
}

.hiddenInput {
	display: none;
}
</style>
