import { fromLegacyFields, type LegacyFormField } from '../migrate/from-legacy-fields';

describe('fromLegacyFields', () => {
	let counter = 0;
	const nextId = () => `id${counter++}`;
	beforeEach(() => {
		counter = 0;
	});

	it('converts the classic field set with stable generated ids', () => {
		const fields: LegacyFormField[] = [
			{ fieldLabel: 'Name', fieldType: 'text', requiredField: true, placeholder: 'Jane' },
			{ fieldLabel: 'Email', fieldType: 'email' },
			{
				fieldLabel: 'Color',
				fieldType: 'dropdown',
				fieldOptions: { values: [{ option: 'Red' }, { option: 'Blue' }] },
				multiselect: true,
			},
			{
				fieldLabel: 'Toppings',
				fieldType: 'checkbox',
				fieldOptions: { values: [{ option: 'Cheese' }] },
				limitSelection: 'range',
				minSelections: 1,
				maxSelections: 2,
			},
			{ fieldLabel: 'CV', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf' },
			{ fieldLabel: '', fieldType: 'hiddenField', fieldName: 'source', fieldValue: 'landing' },
			{ fieldLabel: 'Info', fieldType: 'html', html: '<p>hello</p>', elementName: 'info' },
			{ fieldLabel: 'Birthday', fieldType: 'date', formatDate: 'dd/MM/yyyy' },
		];

		const definition = fromLegacyFields(
			fields,
			{ formTitle: 'Signup', formDescription: 'Join us', customCss: ':root {}' },
			nextId,
		);

		expect(definition.version).toBe(1);
		expect(definition.title).toBe('Signup');
		expect(definition.description).toBe('Join us');
		expect(definition.theme.customCss).toBe(':root {}');
		expect(definition.layout.mode).toBe('classic');

		const [name, email, color, toppings, cv, hidden, info, birthday] = definition.page.elements;
		expect(name).toMatchObject({
			type: 'text',
			label: 'Name',
			required: true,
			placeholder: 'Jane',
		});
		expect(email).toMatchObject({ type: 'email', label: 'Email' });
		expect(color.config).toMatchObject({ multiple: true });
		expect(
			(color.config as { options: Array<{ label: string }> }).options.map((o) => o.label),
		).toEqual(['Red', 'Blue']);
		expect(toppings.config).toMatchObject({
			limitSelection: 'range',
			minSelections: 1,
			maxSelections: 2,
		});
		expect(cv.config).toMatchObject({ multiple: false, acceptFileTypes: '.pdf' });
		expect(hidden).toMatchObject({ type: 'hidden', label: 'source' });
		expect(hidden.config).toMatchObject({ value: 'landing' });
		expect(info).toMatchObject({ type: 'html', key: 'info' });
		expect(info.config).toMatchObject({ html: '<p>hello</p>' });
		expect(birthday.config).toMatchObject({ format: 'dd/MM/yyyy' });

		const ids = definition.page.elements.map((element) => element.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('sets key only when fieldName differs from the label', () => {
		const [same, different] = fromLegacyFields(
			[
				{ fieldLabel: 'Name', fieldName: 'Name', fieldType: 'text' },
				{ fieldLabel: 'Your name', fieldName: 'name', fieldType: 'text' },
			],
			{},
			nextId,
		).page.elements;
		expect(same.key).toBeUndefined();
		expect(different.key).toBe('name');
	});

	it('defaults file fields to multiple uploads like legacy', () => {
		const [file] = fromLegacyFields([{ fieldLabel: 'Files', fieldType: 'file' }], {}, nextId).page
			.elements;
		expect(file.config).toMatchObject({ multiple: true });
	});
});
