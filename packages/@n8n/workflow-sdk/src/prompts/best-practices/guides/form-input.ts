import type { BestPracticesDocument } from '../types';
import { WorkflowTechnique } from '../types';

export class FormInputBestPractices implements BestPracticesDocument {
	readonly technique = WorkflowTechnique.FORM_INPUT;
	readonly version = '1.1.0';

	private readonly documentation = `# Best Practices: Form Input Workflows

## Workflow Design

### Critical: Always Store Raw Form Data

ALWAYS store raw form responses to a persistent data storage destination even if the primary purpose of the workflow is
to trigger another action (like sending to an API or triggering a notification). This allows users to monitor
form responses as part of the administration of their workflow.

Required storage destinations include:
- Google Sheets node
- Airtable node
- n8n Data Tables
- PostgreSQL/MySQL/MongoDB nodes
- Any other database or spreadsheet service

IMPORTANT: Simply using Set or Merge nodes is NOT sufficient. These nodes only transform data in memory - they do not
persist data. You must use an actual storage node (like Google Sheets, Airtable, or Data Tables) to write the data.

Storage Requirements:
- Store the un-edited user input immediately after the form steps are complete
- Do not store only a summary or edited version of the user's inputs - store the raw data
- For single-step forms: store immediately after the form trigger
- For multi-step forms: store immediately after aggregating all steps with Set/Merge nodes
- The storage node should appear in the workflow right after data collection/aggregation

## Message Attribution

n8n forms attach the attribution "n8n workflow" to messages by default - you must disable this setting which will
often be called "Append n8n Attribution" for the n8n form nodes, add this setting and set it to false.

## Multi-Step Forms

Build multi-step forms by chaining multiple Form nodes together. Each Form node represents a page or step in your form
sequence. Use the n8n Form Trigger node to start the workflow and display the first form page to the user.

## Data Collection & Aggregation

Collect and merge all user responses from each form step before writing to your destination (e.g., Data Table). Use
Set or Merge nodes to combine data as needed. Make sure your JSON keys match the column names in your destination for
automatic mapping.

## Conditional Logic & Branching

Use IF or Switch nodes to direct users to different form pages based on their previous answers. This enables dynamic
form flows where the path changes based on user input, creating personalized form experiences.

## Dynamic Form Fields

For fields whose options genuinely depend on runtime data (e.g. a dropdown populated from an API or a
previous step), generate the form definition in a Code node and pass it to the Form node as JSON.
Use this only when the fields cannot be known upfront: for conditional *visibility* prefer \`page.logic\`
on a static \`formDefinition\` (see above), which stays editable in the visual form builder.

## Input Validation

Validate user input between steps to ensure data quality. If input is invalid, loop back to the relevant form step with
an error message to guide the user to correct their submission. This prevents bad data from entering your system.

## Form Definition (typeVersion 3 — PREFERRED)

Set \`typeVersion: 3\` on \`formTrigger\` and \`form\` nodes and define the form with a single
\`formDefinition\` parameter, passed as a **JSON string**. This is the model the visual form
builder reads and writes; prefer it over the older \`formFields\` collection for every new form.
Each node owns exactly one page.

\`\`\`json
{
  "version": 1,
  "id": "feedback-form",
  "title": "How did we do?",
  "description": "Two minutes, and it genuinely helps.",
  "layout": { "mode": "oneAtATime", "containerWidth": "narrow", "density": "relaxed" },
  "theme": { "colors": { "primary": "#3E5DFF" }, "radius": "lg", "buttonStyle": "solid" },
  "page": {
    "id": "page-1",
    "elements": [
      { "id": "name", "type": "text", "label": "Your name", "required": true, "placeholder": "Jane Doe" },
      { "id": "rating", "type": "rating", "label": "Overall experience", "required": true,
        "config": { "style": "stars", "max": 5 } },
      { "id": "recommend", "type": "opinionScale", "label": "Would you recommend us?",
        "config": { "min": 0, "max": 10, "lowLabel": "Not at all", "highLabel": "Absolutely" } }
    ],
    "logic": []
  }
}
\`\`\`

### Element types

Every element needs \`id\` (stable, unique), \`type\`, and \`label\`. Optional on any element:
\`description\`, \`required\`, \`placeholder\`, \`defaultValue\`, \`key\` (output key — defaults to the label).

Use the richer types when they fit the question; do not reach for \`text\` and \`dropdown\` for everything.

- \`text\`, \`textarea\`, \`email\`, \`password\`, \`phone\`, \`url\` — text inputs. \`text\`/\`textarea\` accept \`config: { minLength, maxLength }\`.
- \`number\` — \`config: { min, max, step }\`
- \`date\` — \`config: { format }\`
- \`rating\` — \`config: { style: "stars" | "scale", min, max, lowLabel, highLabel }\`. Best for satisfaction/quality questions.
- \`opinionScale\` — \`config: { min, max, lowLabel, highLabel }\`. Best for 0–10 / NPS-style questions.
- \`yesNo\` — \`config: { yesLabel, noLabel }\`. Use instead of a two-option dropdown.
- \`dropdown\`, \`radio\`, \`checkbox\` — \`config: { options: [{ id, label }], ... }\`. \`dropdown\` also takes \`multiple\`; \`checkbox\` also takes \`limitSelection: "exact" | "range" | "unlimited"\` with \`numberOfSelections\` / \`minSelections\` / \`maxSelections\`. Prefer \`radio\` for 2–5 visible choices, \`dropdown\` for longer lists.
- \`file\` — \`config: { multiple, acceptFileTypes }\`
- \`hidden\` — \`config: { value }\`. Carries a fixed value through the submission.
- \`statement\` — \`config: { text }\`. Display-only copy; use it to introduce a section.
- \`html\` — \`config: { html }\`. Display-only rich content.

\`statement\` and \`html\` produce no output value; every other type does.

### Presentation

Fill in \`theme\` and \`layout\` — a form left at defaults looks unfinished. Choose values that suit
the subject matter rather than always emitting the same ones.

- \`layout.mode\`: \`"classic"\` shows all fields at once; \`"oneAtATime"\` shows one per screen and suits surveys and longer forms.
- \`layout.containerWidth\`: \`"narrow" | "default" | "wide"\`; \`layout.density\`: \`"compact" | "default" | "relaxed"\`.
- \`theme.colors\`: \`primary\`, \`background\`, \`surface\`, \`text\`, \`error\` (hex). Setting \`primary\` alone already lifts the form.
- \`theme.radius\`: a corner radius in px (0–64), or one of the presets \`"none" | "sm" | "md" | "lg" | "pill"\`; \`theme.buttonStyle\`: \`"solid" | "outline"\`; \`theme.colorScheme\`: \`"light" | "dark" | "auto"\`.
- \`theme.font\` / \`theme.font.headingFamily\` for typography, \`theme.logoUrl\` when the user supplies one.

Give the form a real \`title\` and a short \`description\` — not the field list restated.

### Conditional fields

\`page.logic\` holds show/hide rules evaluated against answers on the same page:

\`\`\`json
{ "id": "vis_details", "when": { "combinator": "all",
    "conditions": [ { "elementId": "recommend", "operator": "lte", "value": 6 } ] },
  "actions": [ { "type": "show", "targetElementId": "details" } ] }
\`\`\`

Operators: \`eq\`, \`neq\`, \`contains\`, \`notContains\`, \`gt\`, \`gte\`, \`lt\`, \`lte\`, \`isEmpty\`, \`isNotEmpty\`, \`in\`, \`notIn\`.
Prefer this over splitting a form across pages with IF nodes when the branching is only about field visibility.

Every \`elementId\` / \`targetElementId\` must match an element \`id\` on that page.

### Fields you must not author

\`formDefinition.storage\` is builder-owned metadata linking the form to a data table for its
responses view — its \`columnMap\` is derived from the live data table's columns. Never emit it.
Storing responses is still the storage node's job: wire a Data Table (or Sheets/Airtable/DB) node
after the form as described above.

## Recommended Nodes

### n8n Form Trigger (n8n-nodes-base.formTrigger)

Purpose: Starts the workflow and displays the first form page to the user

Pitfalls:

- Use the Production URL for live forms; the Test URL is for development and debugging only
- Ensure the form trigger is properly configured before sharing URLs with users

### n8n Form (n8n-nodes-base.form)

Purpose: Displays form pages in multi-step form sequences

Pitfalls:

- Each Form node represents one page/step in your form
- Prefer \`typeVersion: 3\` with a \`formDefinition\` (see above) for static forms
- Generate form fields dynamically using a Code node only when the fields genuinely depend on
  runtime data (e.g. dropdown options fetched from an API) — a runtime-generated form cannot be
  edited in the visual form builder, so never use it for a form whose fields are known upfront

### Storage Nodes

Purpose: Persist raw form data to a storage destination, preference should be for built-in n8n tables
but use the most applicable node depending on the user's request.

Required nodes (use at least one):
- Data table (n8n-nodes-base.dataTable): Built-in n8n storage for quick setup - preferred
- Google Sheets (n8n-nodes-base.googleSheets): Best for simple spreadsheet storage
- Airtable (n8n-nodes-base.airtable): Best for structured database with relationships
- Postgres (n8n-nodes-base.postgres) / MySQL (n8n-nodes-base.mySql) / MongoDB (n8n-nodes-base.mongoDb): For production database storage

Pitfalls:

- Every form workflow MUST include a storage node that actually writes data to a destination
- Set and Merge nodes alone are NOT sufficient - they only transform data in memory
- The storage node should be placed immediately after the form trigger (single-step) or after data aggregation (multi-step)

### Code (n8n-nodes-base.code)

Purpose: Processes form data, generates dynamic form definitions, or implements custom validation logic

### Edit Fields (Set) (n8n-nodes-base.set)

Purpose: Aggregates and transforms form data between steps (NOT for storage - use a storage node)

### Merge (n8n-nodes-base.merge)

Purpose: Combines data from multiple form steps into a single dataset (NOT for storage - use a storage node)

Pitfalls:

- Ensure data from all form steps is properly merged before writing to destination
- Use appropriate merge modes (append, merge by key, etc.) for your use case
- Remember: Merge prepares data but does not store it - add a storage node after Merge

### If (n8n-nodes-base.if)

Purpose: Routes users to different form pages based on their previous answers

### Switch (n8n-nodes-base.switch)

Purpose: Implements multi-path conditional routing in complex forms

Pitfalls:

- Include a default case to handle unexpected input values
- Keep routing logic clear and maintainable

## Common Pitfalls to Avoid

### Missing Raw Form Response Storage

When building n8n forms it is recommended to always store the raw form response to some form of data storage (Googlesheets, Airtable, etc)
for administration later. It is CRITICAL if you create a n8n form node that you store the raw output with a storage node.

### Data Loss in Multi-Step Forms

Aggregate all form step data using Set/Merge nodes before writing to your destination. Failing to merge data from multiple steps
can result in incomplete form submissions being stored. After merging, ensure you write the complete dataset to a storage node.

### Poor User Experience

Use the Form Ending page type to show a completion message or redirect users after submission.
Without a proper ending, users may be confused about whether their submission was successful.

### Invalid Data

Implement validation between form steps to catch errors early. Without validation, invalid data can
propagate through your workflow and corrupt your destination data.

### Complex Field Generation

When generating dynamic form fields, ensure the JSON structure exactly matches what the Form
node expects. Test thoroughly with the Test URL before going live.

### Mapping Errors

When writing to Google Sheets or other destinations, ensure field names match exactly. Mismatched names
will cause data to be written to wrong columns or fail entirely.
`;

	getDocumentation(): string {
		return this.documentation;
	}
}
