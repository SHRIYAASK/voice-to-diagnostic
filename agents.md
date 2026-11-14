
# STRICT DEVELOPMENT RULES

## 1. Golden Rule
Only modify code directly required to complete the
user's current request.

Do not modify unrelated files, components, functions,
features, APIs, or business logic.

## 2. Preserve Existing Functionality
- Existing working functionality must remain unchanged.
- Do not rewrite working code just to improve its style.
- Do not refactor unrelated components.
- Do not change previously corrected functionality.
- Do not remove existing validations or error handling.
- Do not change UI design unless explicitly requested.

## 3. Before Making Changes
First:
1. Understand the user's exact request.
2. Identify the files relevant to the requested change.
3. Read the existing implementation.
4. Identify dependencies and potential side effects.
5. Explain which files you intend to modify.

Do not start changing files before this analysis.

## 4. Change Scope
- Make the smallest possible code change.
- Prefer modifying existing functions over rewriting them.
- Do not create duplicate components or functions.
- Do not rename existing variables, files, or functions
  unless explicitly requested.
- Do not change database schemas or API contracts
  unless explicitly requested.
- Do not modify configuration files unnecessarily.

## 5. Protect Previously Completed Work
Treat all existing working functionality as protected.

If a requested change requires modifying an existing
working feature:
- Explain why the modification is necessary.
- Identify possible side effects.
- Ask for approval before proceeding.

Never undo or overwrite previous corrections.

## 6. Testing
After making changes:
- Test the requested functionality.
- Check that existing related functionality still works.
- Check for compilation errors.
- Check for unintended changes.

If a test fails, investigate without randomly
modifying unrelated files.

## 7. File Modification Restrictions
Do not:
- Rewrite entire files when a small edit is sufficient.
- Delete existing code without approval.
- Modify unrelated files.
- Make broad changes across the project.
- Replace existing architecture with a new approach.

## 8. Final Report
After completing every task, report:
1. Files modified.
2. Exact changes made.
3. Existing functionality preserved.
4. Tests performed and results.
5. Any remaining issues.

## 9. Most Important Instruction
The user's current request is the ONLY scope of work.

Do not make additional improvements, optimizations,
refactoring, or changes based on your own assumptions.

When uncertain, STOP and ASK before modifying code.
