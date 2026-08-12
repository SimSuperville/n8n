import type { FormPage, LogicRule } from '../definition/types';
import { evaluateCondition, evaluateVisibility } from '../logic/evaluate';

describe('evaluateCondition', () => {
	it.each([
		['eq', 'a', 'a', true],
		['eq', 'a', 'b', false],
		['eq', 4, '4', true],
		['neq', 'a', 'b', true],
		['gt', 5, 4, true],
		['gt', 3, 4, false],
		['gte', 4, 4, true],
		['lt', 3, 4, true],
		['lte', 5, 4, false],
		['contains', 'hello world', 'world', true],
		['notContains', 'hello', 'world', true],
	] as const)('%s(%j, %j) -> %s', (operator, value, expected, result) => {
		expect(evaluateCondition({ elementId: 'el', operator, value: expected }, { el: value })).toBe(
			result,
		);
	});

	it('handles isEmpty and isNotEmpty', () => {
		expect(evaluateCondition({ elementId: 'el', operator: 'isEmpty' }, {})).toBe(true);
		expect(evaluateCondition({ elementId: 'el', operator: 'isEmpty' }, { el: '  ' })).toBe(true);
		expect(evaluateCondition({ elementId: 'el', operator: 'isEmpty' }, { el: [] })).toBe(true);
		expect(evaluateCondition({ elementId: 'el', operator: 'isNotEmpty' }, { el: 'x' })).toBe(true);
	});

	it('handles in and notIn', () => {
		expect(
			evaluateCondition({ elementId: 'el', operator: 'in', value: ['a', 'b'] }, { el: 'a' }),
		).toBe(true);
		expect(
			evaluateCondition({ elementId: 'el', operator: 'notIn', value: ['a', 'b'] }, { el: 'c' }),
		).toBe(true);
	});

	it('matches array values for eq and contains', () => {
		expect(
			evaluateCondition({ elementId: 'el', operator: 'contains', value: 'a' }, { el: ['a', 'b'] }),
		).toBe(true);
		expect(
			evaluateCondition({ elementId: 'el', operator: 'eq', value: 'b' }, { el: ['a', 'b'] }),
		).toBe(true);
	});
});

describe('evaluateVisibility', () => {
	const makePage = (logic: LogicRule[]): FormPage => ({
		id: 'pg',
		elements: [
			{ id: 'rating', type: 'number', label: 'Rating' },
			{ id: 'comment', type: 'textarea', label: 'Comment' },
		],
		logic,
	});

	const showCommentWhenLowRating: LogicRule = {
		id: 'r1',
		when: { combinator: 'all', conditions: [{ elementId: 'rating', operator: 'lt', value: 4 }] },
		actions: [{ type: 'show', targetElementId: 'comment' }],
	};

	it('hides a show-target when the rule does not match', () => {
		expect(evaluateVisibility(makePage([showCommentWhenLowRating]), { rating: 5 })).toEqual(
			new Set(['comment']),
		);
	});

	it('shows a show-target when the rule matches', () => {
		expect(evaluateVisibility(makePage([showCommentWhenLowRating]), { rating: 2 })).toEqual(
			new Set(),
		);
	});

	it('hide-action hides when matched', () => {
		const rule: LogicRule = {
			id: 'r2',
			when: { combinator: 'any', conditions: [{ elementId: 'rating', operator: 'gte', value: 4 }] },
			actions: [{ type: 'hide', targetElementId: 'comment' }],
		};
		expect(evaluateVisibility(makePage([rule]), { rating: 4 })).toEqual(new Set(['comment']));
		expect(evaluateVisibility(makePage([rule]), { rating: 1 })).toEqual(new Set());
	});
});
