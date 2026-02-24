Produce LikeC4 DSL code that updates the architecture model to reflect the findings from PR #{{metadata.number}}: {{metadata.title}}

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

Create LikeC4 DSL code covering:

### 1. NEW COMPONENT DEFINITIONS

For any services/databases/external systems not yet present in the model:

- Pick a suitable namespace (external, core, cloud, analytics, etc.)
- Assign the correct component type (service, database, webApp, system, etc.)
- Specify the technology stack when it can be inferred from context
- Provide a description and relevant tags

Example:

```likec4
external.sms_gateway = service 'SMS Gateway' {
  description 'Third-party SMS delivery service'
  technology 'REST API'
}
```

### 2. RELATIONSHIP UPDATES

For the affected component:

- Use SIMPLE relationship syntax on a SINGLE line
- Format: -[type]-> target_component_id 'description'
- DO NOT include curly braces { } in relationships
- DO NOT add nested blocks inside relationships

Map connection types:

- HTTP/REST APIs → -[https]->
- Message queues/Service Bus → -[servicebus]->
- Database connections → -[database]->
- WebSocket connections → -[websocket]->

Every relationship must include a description of its purpose

**CORRECT EXAMPLES:**

```likec4
-[https]-> external.maps_service 'Resolves addresses to geographic coordinates'
-[servicebus]-> core.message_broker 'Publishes inventory change events'
-[database]-> data.session_store 'Persists active user sessions'
```

**WRONG EXAMPLES (do NOT generate these):**

```likec4
-> external.maps_service 'Resolves addresses' {  // NO BRACES!
-> external.maps_service {                        // NO BRACES!
  description 'something'                           // NO NESTED CONTENT!
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

- Component IDs: lowercase with underscores (e.g., maps_service)
- Select the appropriate namespace based on the component's role:
  - `external.*` - Third-party services, external APIs
  - `core.*` - Core business services
  - `cloud.*` - Cloud infrastructure services
  - `analytics.*` - Analytics and reporting services
  - `api.*` - API services and backends
  - `web.*` - Web-facing applications
  - `data.*` - Data storage and processing services

## OUTPUT FORMAT

Your response must contain ONLY LikeC4 code updates in this exact structure:

```likec4
// Generated from PR #{{metadata.number}}: {{metadata.title}}
// Date: {{date}}
// Component affected: {{component.id}}

// === NEW COMPONENT DEFINITIONS ===
// Define any new components that don't exist in the model yet
// Example format:
//   external.maps_service = service 'Maps Service' {
//     description 'Geocoding and route calculation service'
//     technology 'REST API'
//   }

// === RELATIONSHIP UPDATES ===
// Add these relationships to {{component.id}}
// CRITICAL: Use simple, single-line format WITHOUT curly braces
// Example format:
//   -[https]-> external.maps_service 'Resolves addresses to geographic coordinates'
//   -[servicebus]-> core.message_broker 'Publishes inventory change events'
//   -[database]-> data.session_store 'Persists active user sessions'
```

## EXAMPLE OF CORRECT OUTPUT

```likec4
// Generated from PR #123
// Date: 2025-01-08
// Component affected: core.reporting.report_generator

// === NEW COMPONENT DEFINITIONS ===
external.maps_service = service 'Maps Service' {
  description 'Geocoding and route calculation service'
  technology 'REST API'
}

// === RELATIONSHIP UPDATES ===
-[https]-> external.maps_service 'Resolves addresses to geographic coordinates'
-[servicebus]-> core.message_broker 'Publishes inventory change events'
```

## EXAMPLE OF INCORRECT OUTPUT (DO NOT GENERATE THIS)

```likec4
// BAD - has curly braces in relationships
-[https]-> external.maps_service 'Resolves addresses' {
  description 'something'
}

// BAD - incomplete closing brace
-> external.maps_service {
```

Now generate the LikeC4 model updates following the CORRECT format:
