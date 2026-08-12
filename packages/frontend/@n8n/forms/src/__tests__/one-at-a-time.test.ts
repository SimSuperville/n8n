import type { FormDefinition } from '@n8n/form-core';
import { mount } from '@vue/test-utils';

import FormRenderer from '../components/FormRenderer.vue';

function makeDefinition(): FormDefinition {
	return {
		version: 1,
		id: 'frm1',
		title: 'Feedback',
		description: 'Tell us how we did',
		layout: { mode: 'oneAtATime' },
		theme: {},
		page: {
			id: 'pg1',
			elements: [
				{
					id: 'rating',
					type: 'number',
					label: 'Rating',
					required: true,
					config: { min: 1, max: 5 },
				},
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
}

// Step transitions run on timers; stubbing Transition swaps steps synchronously
const mountOptions = { global: { stubs: { transition: true } } };

describe('FormRenderer one-at-a-time', () => {
	it('renders one question at a time with counter and progress bar', () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		expect(wrapper.findAll('.n8n-form-field')).toHaveLength(1);
		expect(wrapper.text()).toContain('Rating');
		// Comment is logic-hidden until rating < 4, so it is not counted
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('1 of 2');
		expect(wrapper.find('.n8n-form-progress-bar').attributes('style')).toContain('width: 0%');
	});

	it('blocks advancing past an unanswered required question', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.find('.n8n-form-error').exists()).toBe(true);
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('1 of 2');
	});

	it('advances with Enter and skips logic-hidden questions', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		await wrapper.find('input[type="number"]').setValue('5');
		await wrapper.find('form').trigger('keydown', { key: 'Enter' });
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('2 of 2');
		expect(wrapper.text()).toContain('Color');
		expect(wrapper.text()).not.toContain('Comment');
	});

	it('includes a logic-shown question when its condition matches', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		await wrapper.find('input[type="number"]').setValue('2');
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('2 of 3');
		expect(wrapper.text()).toContain('Comment');
	});

	it('navigates back with the up arrow button', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		await wrapper.find('input[type="number"]').setValue('5');
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.text()).toContain('Color');
		await wrapper.find('[aria-label="Previous question"]').trigger('click');
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('1 of 2');
		expect(wrapper.text()).toContain('Rating');
	});

	it('reaches the review step and submits with wire names', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		await wrapper.find('input[type="number"]').setValue('5');
		await wrapper.find('.n8n-form-ok').trigger('click');
		await wrapper.find('input[type="radio"][value="o1"]').setValue(true);
		expect(wrapper.find('.n8n-form-ok').text()).toBe('Review');
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.text()).toContain('Ready to submit?');
		expect(wrapper.find('.n8n-form-progress-bar').attributes('style')).toContain('width: 100%');

		await wrapper.find('form').trigger('submit');
		const emitted = wrapper.emitted('submit');
		expect(emitted).toHaveLength(1);
		const formData = emitted?.[0][0] as FormData;
		expect(formData.get('f_rating')).toBe('5');
		expect(formData.get('f_color')).toBe('o1');
	});

	it('lets the builder preview navigate without answering', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition(), mode: 'preview' },
			...mountOptions,
		});
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.find('.n8n-form-step-counter').text()).toBe('2 of 2');
		expect(wrapper.find('.n8n-form-error').exists()).toBe(false);
	});

	it('shows the form header only on the first question', async () => {
		const wrapper = mount(FormRenderer, {
			props: { definition: makeDefinition() },
			...mountOptions,
		});
		expect(wrapper.find('.n8n-form-title').exists()).toBe(true);
		await wrapper.find('input[type="number"]').setValue('5');
		await wrapper.find('.n8n-form-ok').trigger('click');
		expect(wrapper.find('.n8n-form-title').exists()).toBe(false);
	});
});

describe('FormRenderer theming', () => {
	function themedDefinition(): FormDefinition {
		const definition = makeDefinition();
		definition.layout = {
			mode: 'classic',
			density: 'compact',
			cover: { imageUrl: 'https://example.com/cover.png', split: 'left' },
		};
		definition.theme = {
			buttonStyle: 'outline',
			font: { family: 'Georgia, serif', headingFamily: 'Verdana, sans-serif' },
		};
		return definition;
	}

	it('applies density, button style, and split-cover classes', () => {
		const wrapper = mount(FormRenderer, { props: { definition: themedDefinition() } });
		const root = wrapper.find('.n8n-form-root');
		expect(root.classes()).toContain('n8n-form-root--density-compact');
		expect(root.classes()).toContain('n8n-form-root--outline');
		expect(root.classes()).toContain('n8n-form-root--split');
		const pane = wrapper.find('.n8n-form-cover-pane');
		expect(pane.exists()).toBe(true);
		expect(pane.attributes('style')).toContain('https://example.com/cover.png');
		expect(wrapper.find('.n8n-form-cover-banner').exists()).toBe(false);
	});

	it('renders the cover as a banner when there is no split', () => {
		const definition = themedDefinition();
		definition.layout.cover = { imageUrl: 'https://example.com/cover.png', split: 'none' };
		const wrapper = mount(FormRenderer, { props: { definition } });
		expect(wrapper.find('.n8n-form-cover-banner').exists()).toBe(true);
		expect(wrapper.find('.n8n-form-cover-pane').exists()).toBe(false);
	});

	it('derives readable text colors from a dark card color', () => {
		const definition = makeDefinition();
		definition.layout = { mode: 'classic' };
		definition.theme = { colors: { surface: '#1f2430' } };
		const wrapper = mount(FormRenderer, { props: { definition } });
		const style = wrapper.find('.n8n-form-root').attributes('style') ?? '';
		expect(style).toContain('--n8n-form-color-heading: #f2f2f4');
		expect(style).toContain('--n8n-form-color-text: #d6d6db');
	});

	it('keeps default text colors on a light card and respects explicit text', () => {
		const definition = makeDefinition();
		definition.layout = { mode: 'classic' };
		definition.theme = { colors: { surface: '#ffffff' } };
		const light = mount(FormRenderer, { props: { definition } });
		expect(light.find('.n8n-form-root').attributes('style') ?? '').toContain(
			'--n8n-form-color-text: #555555',
		);

		definition.theme = { colors: { surface: '#1f2430', text: '#123456' } };
		const explicit = mount(FormRenderer, { props: { definition } });
		expect(explicit.find('.n8n-form-root').attributes('style') ?? '').toContain(
			'--n8n-form-color-text: #123456',
		);
	});

	it('applies font families as CSS custom properties', () => {
		const wrapper = mount(FormRenderer, { props: { definition: themedDefinition() } });
		const style = wrapper.find('.n8n-form-root').attributes('style') ?? '';
		expect(style).toContain('--n8n-form-font-family: Georgia, serif');
		expect(style).toContain('--n8n-form-font-heading: Verdana, sans-serif');
	});
});
