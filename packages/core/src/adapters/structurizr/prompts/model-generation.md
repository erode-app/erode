Produce Structurizr DSL code that updates the architecture model to reflect the findings from PR #{{metadata.number}}: {{metadata.title}}

## SOURCE COMPONENT

- ID: {{component.id}}
- Name: {{component.name}}
- Type: {{component.type}}
- Repository: {{component.repository}}

{{existingComponentsSection}}

## DETECTED ARCHITECTURAL VIOLATIONS

{{violationsSection}}

## CODE-LEVEL DEPENDENCY CHANGES

The following NEW dependencies were identified in this PR:
{{dependencyChangesSection}}

## SUGGESTED MODEL CHANGES

{{modelUpdatesSection}}

## KEY CONSTRAINTS

- The violations listed above represent NEW dependencies introduced by this PR
- These are ADDITIONS to the current architecture, not replacements for existing relationships
- All existing dependencies for this component must remain intact
- Only produce code for the NEW components and relationships being introduced

## GENERATION RULES

Create Structurizr DSL code covering:

### 1. NEW COMPONENT DEFINITIONS

For any services/databases/external systems not yet present in the model:

- Choose the appropriate element type: `softwareSystem`, `container`, or `component`
- Assign a descriptive name and description
- Specify the technology stack when it can be inferred from context
- Provide relevant tags (e.g., "External", "Database")

Example:

```dsl
sms_gateway = softwareSystem "SMS Gateway" {
    description "Third-party SMS delivery service"
    tags "External"
    technology "REST API"
}
```

### 2. RELATIONSHIP UPDATES

For the affected component:

- Use Structurizr relationship syntax on a SINGLE line
- Format: `sourceIdentifier -> destinationIdentifier "description" "technology"`
- DO NOT nest relationships inside element blocks when defining them separately
- Keep descriptions concise and purpose-focused

Map connection types via the technology field:

- HTTP/REST APIs → "REST API" or "HTTPS"
- Message queues → "Message Queue" or "AMQP"
- Database connections → "JDBC" or "SQL"
- WebSocket connections → "WebSocket"

Every relationship must include a description of its purpose.

**CORRECT EXAMPLES:**

```dsl
{{component.id}} -> external_maps_service "Resolves addresses to geographic coordinates" "REST API"
{{component.id}} -> core_message_broker "Publishes inventory change events" "Message Queue"
{{component.id}} -> data_session_store "Persists active user sessions" "JDBC"
```

**WRONG EXAMPLES (do NOT generate these):**

```dsl
{{component.id}} -> external_maps_service {   // NO BLOCK SYNTAX FOR RELATIONSHIPS!
    description "Resolves addresses"            // NO NESTED CONTENT IN RELATIONSHIPS!
}
```

### 3. COMPONENT UPDATES

When properties need modification:

- Updated descriptions
- New tags
- Technology changes

### 4. REMOVAL INSTRUCTIONS

ONLY if explicitly listed in modelUpdates.remove:

- IMPORTANT: Do NOT remove existing allowed dependencies
- Only mark relationships for removal if they appear in the "REMOVE FROM MODEL" section above
- If modelUpdates.remove is empty or None, do NOT suggest any removals

## NAMING CONVENTIONS

- Identifiers: lowercase with underscores (e.g., `maps_service`, `sms_gateway`)
- Use descriptive quoted names (e.g., `"SMS Gateway"`, `"Maps Service"`)
- Choose element types based on scope:
  - `softwareSystem` - Top-level external or internal systems
  - `container` - Deployable units within a software system (apps, databases, services)
  - `component` - Modules or classes within a container

## OUTPUT FORMAT

Your response must contain ONLY Structurizr DSL updates in this exact structure:

```dsl
// Generated from PR #{{metadata.number}}: {{metadata.title}}
// Date: {{date}}
// Component affected: {{component.id}}

// === NEW COMPONENT DEFINITIONS ===
// Define any new elements that don't exist in the model yet
// Example format:
//   sms_gateway = softwareSystem "SMS Gateway" {
//       description "Third-party SMS delivery service"
//       tags "External"
//       technology "REST API"
//   }

// === RELATIONSHIP UPDATES ===
// Add these relationships for {{component.id}}
// CRITICAL: Use single-line format
// Example format:
//   {{component.id}} -> external_maps_service "Resolves addresses to geographic coordinates" "REST API"
//   {{component.id}} -> core_message_broker "Publishes inventory change events" "Message Queue"
//   {{component.id}} -> data_session_store "Persists active user sessions" "JDBC"
```

## EXAMPLE OF CORRECT OUTPUT

```dsl
// Generated from PR #123: Add geocoding integration
// Date: 2025-01-08
// Component affected: core_reporting_report_generator

// === NEW COMPONENT DEFINITIONS ===
external_maps_service = softwareSystem "Maps Service" {
    description "Geocoding and route calculation service"
    tags "External"
    technology "REST API"
}

// === RELATIONSHIP UPDATES ===
core_reporting_report_generator -> external_maps_service "Resolves addresses to geographic coordinates" "REST API"
core_reporting_report_generator -> core_message_broker "Publishes inventory change events" "Message Queue"
```

## EXAMPLE OF INCORRECT OUTPUT (DO NOT GENERATE THIS)

```dsl
// BAD - block syntax used for a relationship
core_reporting_report_generator -> external_maps_service {
    description "Resolves addresses"
}

// BAD - missing description on relationship
core_reporting_report_generator -> external_maps_service
```

Now generate the Structurizr DSL model updates following the CORRECT format:
