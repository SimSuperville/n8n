export * from './definition/types';
export {
	formDefinitionSchema,
	parseFormDefinition,
	safeParseFormDefinition,
	collectStructuralIssues,
	FormDefinitionParseError,
} from './definition/schema';
export type * from './registry/types';
export { getFieldType, listFieldTypes, registerFieldType } from './registry';
export { getRatingBounds, type RatingConfig } from './registry/fields/rating-field';
export {
	getOpinionScaleBounds,
	type OpinionScaleConfig,
	type StatementConfig,
	type YesNoConfig,
} from './registry/fields/phase3-fields';
export {
	evaluateCondition,
	evaluateRule,
	evaluateVisibility,
	type FormValues,
} from './logic/evaluate';
export {
	validateSubmission,
	type SubmissionError,
	type SubmissionResult,
} from './validation/validate';
export {
	fromLegacyFields,
	convertLegacyField,
	type LegacyFormField,
	type LegacyFormSettings,
} from './migrate/from-legacy-fields';
export { uid } from './utils/uid';
export { toDataTableColumnName, toUniqueDataTableColumnName } from './utils/column-name';
