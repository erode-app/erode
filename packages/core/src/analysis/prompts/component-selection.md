You are determining which component in a monorepo is affected by a set of code changes.

## Components in This Repository

{{components}}

## Files Changed

{{files}}

## Task

Identify the component being modified based on the file paths listed above.

**Selection Strategy:**

1. **PRIMARY: Match folder names to component names:**
   - `api-service/` → component with "API-Service" or "api_service" in name/ID
   - `backend/` or `server/` → component with "Backend" or "Server" in name/ID
   - `frontend/` or `*-ui/` → webapp component
   - `mobile/`, `ios/`, `android/` → mobile app component

2. **SECONDARY: Use descriptions as supporting evidence:**
   - If folder match is unclear, check descriptions for hints (e.g., "Backend for web dashboard" confirms api-service/)
   - BUT folder structure always wins over descriptions

3. **TERTIARY: Use technology as confirmation:**
   - If file extensions indicate a specific stack (`.cs` → .NET, `.java` → Java, `.tsx` → React)
   - Check if technology matches to confirm selection
   - But don't rely on this alone - folder structure is still primary

4. **For shared/core code:**
   - If most files are in `core/`, `shared/`, `common/`, or `lib/`: check which specific API folder also has changes
   - Pick the component that uses that shared code

5. **Match loosely:**
   - "Admin-API" = "admin_api" = "admin-api/" (all refer to the same component)
   - Ignore case and separator differences

**What NOT to do:**

- ❌ Don't select based ONLY on descriptions (folder structure is primary)
- ❌ Don't select based on what the code functionally does
- ❌ Don't guess randomly

## Output Format

Respond with ONLY the component ID, nothing else.

Example: `system.backend.api_service`
