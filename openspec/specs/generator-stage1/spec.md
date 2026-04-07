# Generator Stage 1 — configurable path selection

> Source: archived change `configurable-stage1-path-pressure` (2026-04-06)

## Requirements

### Requirement: Stage 1 path pressure configuration

The system SHALL support optional generation configuration that adjusts Stage 1 instructions so the survey model returns more `schemaFiles`, `serviceFiles`, and `apiFiles` when operators enable higher pressure.

#### Scenario: Default omits extra pressure

- **WHEN** generation configuration does not specify Stage 1 path pressure (or explicitly selects the default preset)
- **THEN** the Stage 1 system or user prompt SHALL match the existing baseline survey instructions without additional path-enumeration constraints beyond current behavior

#### Scenario: Non-default pressure adds explicit enumeration guidance

- **WHEN** the operator sets a non-default Stage 1 path pressure preset or provides optional per-category minimum path counts
- **THEN** the Stage 1 LLM request SHALL include additional normative text instructing the model to enumerate paths broadly within the provided analysis, without inventing paths that are not listed in the analysis input
- **THEN** any configured per-category minimums SHALL be bounded by documented maximum values to avoid unbounded prompt or response size

### Requirement: Configuration surface and typing

The system SHALL expose Stage 1 path pressure settings under the existing spec-gen project configuration (e.g. `.spec-gen/config.json`) in a documented, typed shape merged with `GenerationConfig`.

#### Scenario: Unknown or invalid values fall back safely

- **WHEN** configuration contains unknown preset names, out-of-range numeric values, or malformed structure
- **THEN** the system SHALL log a warning and apply default Stage 1 behavior rather than failing the generate command

### Requirement: Pipeline wiring

The system SHALL pass resolved Stage 1 path pressure options from configuration into the spec generation pipeline so `runStage1` (or its prompt builder) can construct the final survey prompt.

#### Scenario: Generate uses configured pressure

- **WHEN** `spec-gen generate` (or the programmatic run API) loads project configuration with Stage 1 path pressure set
- **THEN** the Stage 1 completion call SHALL use prompts derived from that configuration

### Requirement: Regression tests

The system SHALL include automated tests covering default prompt content without pressure and prompt content with at least one non-default pressure setting, and configuration parsing defaults.

#### Scenario: Tests assert prompt fragments

- **WHEN** tests run for the generator Stage 1 prompt builder
- **THEN** they SHALL assert presence or absence of pressure-specific instruction text consistent with the configured option
