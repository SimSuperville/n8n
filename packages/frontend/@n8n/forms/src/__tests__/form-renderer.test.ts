import type { FormDefinition } from '@n8n/form-core';
import { mount } from '@vue/test-utils';

import FormRenderer from '../components/FormRenderer.vue';

const definition: FormDefinition = {
	version: 1,
	id: 'frm1',
	title: 'Feedback',
	description: 'Tell us how we did',
	layout: { mode: 'classic' },
	theme: { colors: { primary: '#123456' } },
	page: {
		id: 'pg1',
		elements: [
			{ id: 'rating', type: 'number', label: 'Rating', required: true, config: { min: 1, max: 5 } },
			{ id: 'comment', type: 'textarea', label: 'Comment' },
			{
				id: 'color',
				type: 'radio',
				label: 'Color',
				config: {
					options: [
						{ id: 'o1', label: 'Red' },
						{ id: 'o2', label: 'Blue' },
					],
				},
			},
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

describe('FormRenderer', () => {
	it('renders title, description, and visible fields', () => {
		const wrapper = mount(FormRenderer, { props: { definition } });
		expect(wrapper.find('.n8n-form-title').text()).toBe('Feedback');
		expect(wrapper.find('.n8n-form-subtitle').text()).toBe('Tell us how we did');
		expect(wrapper.findAll('label.n8n-form-label').length).toBeGreaterThan(0);
		expect(wrapper.find('fieldset legend').text()).toContain('Color');
	});

	it('hides logic-gated fields until the condition matches', async () => {
		const wrapper = mount(FormRenderer, { props: { definition } });
		expect(wrapper.text()).not.toContain('Comment');

		await wrapper.find('input[type="number"]').setValue('2');
		expect(wrapper.text()).toContain('Comment');

		await wrapper.find('input[type="number"]').setValue('5');
		expect(wrapper.text()).not.toContain('Comment');
	});

	it('blocks submit and shows an error summary when required fields are missing', async () => {
		const wrapper = mount(FormRenderer, { props: { definition } });
		await wrapper.find('form').trigger('submit');
		expect(wrapper.emitted('submit')).toBeUndefined();
		expect(wrapper.find('.n8n-form-error-summary').exists()).toBe(true);
		expect(wrapper.find('.n8n-form-error-summary').text()).toContain('Rating');
	});

	it('emits FormData with wire names on valid submit', async () => {
		const wrapper = mount(FormRenderer, { props: { definition } });
		await wrapper.find('input[type="number"]').setValue('5');
		await wrapper.find('input[type="radio"][value="o1"]').setValue(true);
		await wrapper.find('form').trigger('submit');

		const emitted = wrapper.emitted('submit');
		expect(emitted).toHaveLength(1);
		const formData = emitted?.[0][0] as FormData;
		expect(formData.get('f_rating')).toBe('5');
		expect(formData.get('f_color')).toBe('o1');
	});

	it('applies theme colors as CSS custom properties', () => {
		const wrapper = mount(FormRenderer, { props: { definition } });
		const style = wrapper.find('.n8n-form-root').attributes('style') ?? '';
		expect(style).toContain('--n8n-form-color-primary: #123456');
	});

	it('applies prefill values', () => {
		const wrapper = mount(FormRenderer, {
			props: { definition, prefill: { rating: '3' } },
		});
		expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('3');
	});
});
