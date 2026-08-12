import { getElementKey, type FormPage } from '../definition/types';
import { evaluateVisibility, type FormValues } from '../logic/evaluate';
import { getFieldType } from '../registry';

export interface SubmissionError {
	elementId: string;
	message: string;
}

export interface SubmissionResult {
	/** Coerced values keyed by output key; hidden and display elements omitted */
	values: Record<string, unknown>;
	errors: SubmissionError[];
	/** Element ids hidden by logic at submit time (their values were discarded) */
	hiddenElementIds: string[];
}

/**
 * Validates and coerces a submission against a page definition.
 * `rawValues` is keyed by element id; file fields carry SubmittedFileMeta arrays.
 * Values of elements hidden by logic are discarded, mirroring the client.
 */
export function validateSubmission(page: FormPage, rawValues: FormValues): SubmissionResult {
	const errors: SubmissionError[] = [];
	const coerced: FormValues = {};

	for (const element of page.elements) {
		const descriptor = getFieldType(element.type);
		if (descriptor === undefined) {
			errors.push({ elementId: element.id, message: `Unknown field type "${element.type}"` });
			continue;
		}
		if (descriptor.inputKind === 'display') continue;
		coerced[element.id] = descriptor.coerce(rawValues[element.id], element);
	}

	const hidden = evaluateVisibility(page, coerced);

	const values: Record<string, unknown> = {};
	for (const element of page.elements) {
		const descriptor = getFieldType(element.type);
		if (descriptor === undefined || descriptor.inputKind === 'display') continue;
		if (hidden.has(element.id)) continue;

		const value = coerced[element.id];
		if (value === undefined) {
			if (element.required === true) {
				errors.push({ elementId: element.id, message: `${element.label} is required` });
			}
			continue;
		}

		const message = descriptor.validate(value, element);
		if (message !== null) {
			errors.push({ elementId: element.id, message });
			continue;
		}
		values[getElementKey(element)] = value;
	}

	return { values, errors, hiddenElementIds: [...hidden] };
}
