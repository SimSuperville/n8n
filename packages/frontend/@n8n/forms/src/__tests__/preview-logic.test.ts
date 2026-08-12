import type { FormDefinition } from '@n8n/form-core';
import { mount } from '@vue/test-utils';

import FormRenderer from '../components/FormRenderer.vue';

const definition: FormDefinition = {
	version: 1,
	id: 'frm1',
	title: 'Feedback',
	layout: { mode: 'classic' },
	theme: {},
	page: {
		id: 'pg1',
		elements: [
			{ id: 'rating', type: 'rating', label: 'Rating', config: { style: 'scale', max: 5 } },
			{ id: 'comment', type: 'textarea', label: 'Comment' },
		],
		logic: [
			{
				id: 'r1',
				when: {
					combinator: 'all',
					conditions: [{ elementId: 'rating', operator: 'lt', value: 4 }],
				},
				actions: [{ type: 'show', targetElementId: 'comment' }],
			},
		],
	},
};

describe('preview mode logic', () => {
	it('shows and hides logic-gated fields as the rating changes', async () => {
		const wrapper = mount(FormRenderer, { props: { definition, mode: 'preview' } });
		const step = (n: number) =>
			wrapper.findAll('.n8n-form-rating-step').find((b) => b.text() === String(n))!;

		expect(wrapper.find('[data-element-id="comment"]').exists()).toBe(false);

		await step(2).trigger('click');
		expect(wrapper.find('[data-element-id="comment"]').exists()).toBe(true);

		await step(5).trigger('click');
		expect(wrapper.find('[data-element-id="comment"]').exists()).toBe(false);
	});
});
