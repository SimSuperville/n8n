<script setup lang="ts">
import type { FormElement, LogicCondition, LogicOperator, LogicRule } from '@n8n/form-core';
import { computed, reactive, watch } from 'vue';

import {
	N8nButton,
	N8nIconButton,
	N8nInput,
	N8nOption,
	N8nSelect,
	N8nText,
} from '@n8n/design-system';

import type { useFormBuilder } from '../composables/useFormBuilder';

const props = defineProps<{
	builder: ReturnType<typeof useFormBuilder>;
	element: FormElement;
}>();

type VisibilityMode = 'always' | 'show' | 'hide';

interface ConditionDraft {
	elementId: string;
	operator: LogicOperator;
	value: string;
}

const state = reactive<{
	/** Element the current draft belongs to; guards against writes during selection changes */
	forElementId: string | null;
	mode: VisibilityMode;
	combinator: 'all' | 'any';
	conditions: ConditionDraft[];
}>({
	forElementId: null,
	mode: 'always',
	combinator: 'all',
	conditions: [],
});

const OPERATORS: Array<{ value: LogicOperator; label: string; needsValue: boolean }> = [
	{ value: 'eq', label: 'is', needsValue: true },
	{ value: 'neq', label: 'is not', needsValue: true },
	{ value: 'contains', label: 'contains', needsValue: true },
	{ value: 'gt', label: 'is greater than', needsValue: true },
	{ value: 'lt', label: 'is less than', needsValue: true },
	{ value: 'isNotEmpty', label: 'is answered', needsValue: false },
	{ value: 'isEmpty', label: 'is not answered', needsValue: false },
];

const sourceElements = computed(() => props.builder.conditionSourceElements(props.element.id));

let suspendSync = false;

function loadFromRule() {
	suspendSync = true;
	state.forElementId = props.element.id;
	const rule = props.builder.getVisibilityRule(props.element.id);
	if (rule === undefined) {
		state.mode = 'always';
		state.combinator = 'all';
		state.conditions = [];
	} else {
		state.mode = rule.actions[0]?.type === 'hide' ? 'hide' : 'show';
		state.combinator = rule.when.combinator;
		state.conditions = rule.when.conditions.map((condition) => ({
			elementId: condition.elementId,
			operator: condition.operator,
			value: condition.value === undefined ? '' : String(condition.value),
		}));
	}
	void Promise.resolve().then(() => {
		suspendSync = false;
	});
}

watch(() => props.element.id, loadFromRule, { immediate: true });

function conditionValue(draft: ConditionDraft): LogicCondition['value'] {
	const source = sourceElements.value.find((element) => element.id === draft.elementId);
	if (source?.type === 'yesNo') return draft.value === 'true';
	return draft.value;
}

function writeRule() {
	if (suspendSync) return;
	// Never write a draft that was loaded for a different element (selection changed mid-edit)
	if (state.forElementId !== props.element.id) return;
	if (state.mode === 'always') {
		props.builder.setVisibilityRule(props.element.id, null);
		return;
	}
	const conditions = state.conditions
		.filter((draft) => draft.elementId !== '')
		.map((draft) => {
			const needsValue = OPERATORS.find((op) => op.value === draft.operator)?.needsValue ?? true;
			return {
				elementId: draft.elementId,
				operator: draft.operator,
				...(needsValue ? { value: conditionValue(draft) } : {}),
			};
		});
	if (conditions.length === 0) {
		props.builder.setVisibilityRule(props.element.id, null);
		return;
	}
	const rule: LogicRule = {
		id: `vis_${props.element.id}`,
		when: { combinator: state.combinator, conditions },
		actions: [{ type: state.mode, targetElementId: props.element.id }],
	};
	props.builder.setVisibilityRule(props.element.id, rule);
}

watch(state, writeRule, { deep: true });

function onModeChange(mode: VisibilityMode) {
	state.mode = mode;
	if (mode !== 'always' && state.conditions.length === 0) addCondition();
}

function addCondition() {
	state.conditions.push({
		elementId: sourceElements.value[0]?.id ?? '',
		operator: 'eq',
		value: '',
	});
}

function removeCondition(index: number) {
	state.conditions.splice(index, 1);
}

function sourceElement(draft: ConditionDraft): FormElement | undefined {
	return sourceElements.value.find((element) => element.id === draft.elementId);
}

function needsValue(draft: ConditionDraft): boolean {
	return OPERATORS.find((op) => op.value === draft.operator)?.needsValue ?? true;
}

function choiceLabels(element: FormElement | undefined): string[] {
	const options = (element?.config as { options?: Array<{ label: string }> } | undefined)?.options;
	return options?.map((option) => option.label) ?? [];
}
</script>

<template>
	<div :class="$style.section">
		<div :class="$style.sectionTitle">Visibility</div>

		<N8nSelect
			:model-value="state.mode"
			size="small"
			data-test-id="logic-mode"
			@update:model-value="onModeChange"
		>
			<N8nOption value="always" label="Always visible" />
			<N8nOption value="show" label="Show only when…" />
			<N8nOption value="hide" label="Hide when…" />
		</N8nSelect>

		<template v-if="state.mode !== 'always'">
			<div v-if="sourceElements.length === 0" :class="$style.hint">
				<N8nText size="xsmall" color="text-light">
					Add another field on this page to base a condition on.
				</N8nText>
			</div>

			<template v-else>
				<div v-if="state.conditions.length > 1" :class="$style.combinatorRow">
					<N8nSelect v-model="state.combinator" size="mini">
						<N8nOption value="all" label="All conditions match" />
						<N8nOption value="any" label="Any condition matches" />
					</N8nSelect>
				</div>

				<div v-for="(draft, index) in state.conditions" :key="index" :class="$style.condition">
					<N8nSelect v-model="draft.elementId" size="small" placeholder="Field">
						<N8nOption
							v-for="source in sourceElements"
							:key="source.id"
							:value="source.id"
							:label="source.label"
						/>
					</N8nSelect>
					<div :class="$style.conditionRow">
						<N8nSelect v-model="draft.operator" size="small">
							<N8nOption
								v-for="op in OPERATORS"
								:key="op.value"
								:value="op.value"
								:label="op.label"
							/>
						</N8nSelect>
						<template v-if="needsValue(draft)">
							<N8nSelect
								v-if="sourceElement(draft)?.type === 'yesNo'"
								v-model="draft.value"
								size="small"
							>
								<N8nOption value="true" label="Yes" />
								<N8nOption value="false" label="No" />
							</N8nSelect>
							<N8nSelect
								v-else-if="choiceLabels(sourceElement(draft)).length > 0"
								v-model="draft.value"
								size="small"
								placeholder="Value"
							>
								<N8nOption
									v-for="label in choiceLabels(sourceElement(draft))"
									:key="label"
									:value="label"
									:label="label"
								/>
							</N8nSelect>
							<N8nInput v-else v-model="draft.value" size="small" placeholder="Value" />
						</template>
						<N8nIconButton
							icon="trash-2"
							type="tertiary"
							size="small"
							text
							@click="removeCondition(index)"
						/>
					</div>
				</div>

				<N8nButton type="tertiary" size="small" icon="plus" @click="addCondition">
					Add condition
				</N8nButton>
			</template>
		</template>
	</div>
</template>

<style lang="scss" module>
.section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	border-top: var(--border);
	padding-top: var(--spacing--xs);
	margin-top: var(--spacing--xs);
}

.sectionTitle {
	font-size: var(--font-size--3xs);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color--text--tint-1);
}

.combinatorRow {
	display: flex;
}

.condition {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	border: var(--border);
	border-radius: var(--radius);
	padding: var(--spacing--3xs);
}

.conditionRow {
	display: grid;
	grid-template-columns: 1fr 1fr auto;
	gap: var(--spacing--4xs);
	align-items: center;
}

.hint {
	padding: var(--spacing--4xs) 0;
}
</style>
