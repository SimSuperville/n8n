import type { FormPage, LogicCondition, LogicRule, LogicValue } from '../definition/types';

export type FormValues = Record<string, unknown>;

function isEmptyValue(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

function asComparable(value: unknown): string | number | boolean | undefined {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	return undefined;
}

function looselyEquals(a: unknown, b: unknown): boolean {
	if (typeof a === typeof b) return a === b;
	return String(a) === String(b);
}

function compareNumeric(
	value: unknown,
	expected: LogicValue | undefined,
	check: (a: number, b: number) => boolean,
): boolean {
	const a = Number(asComparable(value));
	const b = Number(asComparable(expected as unknown));
	if (Number.isNaN(a) || Number.isNaN(b)) return false;
	return check(a, b);
}

export function evaluateCondition(condition: LogicCondition, values: FormValues): boolean {
	const value = values[condition.elementId];
	const expected = condition.value;

	switch (condition.operator) {
		case 'isEmpty':
			return isEmptyValue(value);
		case 'isNotEmpty':
			return !isEmptyValue(value);
		case 'eq':
			if (Array.isArray(value)) return value.some((entry) => looselyEquals(entry, expected));
			return looselyEquals(value, expected);
		case 'neq':
			if (Array.isArray(value)) return !value.some((entry) => looselyEquals(entry, expected));
			return !looselyEquals(value, expected);
		case 'contains':
			if (Array.isArray(value)) return value.some((entry) => looselyEquals(entry, expected));
			return typeof value === 'string' && value.includes(String(expected ?? ''));
		case 'notContains':
			if (Array.isArray(value)) return !value.some((entry) => looselyEquals(entry, expected));
			return !(typeof value === 'string' && value.includes(String(expected ?? '')));
		case 'gt':
			return compareNumeric(value, expected, (a, b) => a > b);
		case 'gte':
			return compareNumeric(value, expected, (a, b) => a >= b);
		case 'lt':
			return compareNumeric(value, expected, (a, b) => a < b);
		case 'lte':
			return compareNumeric(value, expected, (a, b) => a <= b);
		case 'in': {
			const list = Array.isArray(expected) ? expected : [];
			return list.some((entry) => looselyEquals(value, entry));
		}
		case 'notIn': {
			const list = Array.isArray(expected) ? expected : [];
			return !list.some((entry) => looselyEquals(value, entry));
		}
		default:
			return false;
	}
}

export function evaluateRule(rule: LogicRule, values: FormValues): boolean {
	const results = rule.when.conditions.map((condition) => evaluateCondition(condition, values));
	return rule.when.combinator === 'all'
		? results.every((result) => result)
		: results.some((result) => result);
}

/**
 * Returns the set of element ids hidden by the page's logic for the given values.
 * Elements are visible by default; rules apply in order, later rules win.
 */
export function evaluateVisibility(page: FormPage, values: FormValues): Set<string> {
	const hidden = new Set<string>();
	for (const rule of page.logic) {
		const matched = evaluateRule(rule, values);
		for (const action of rule.actions) {
			const hideWhenMatched = action.type === 'hide';
			const shouldHide = matched ? hideWhenMatched : !hideWhenMatched;
			if (shouldHide) hidden.add(action.targetElementId);
			else hidden.delete(action.targetElementId);
		}
	}
	return hidden;
}
