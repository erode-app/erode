You are a code editor. Your task is to insert relationship lines into an existing architecture model file.

## MODEL FORMAT

{{modelFormat}}

{{syntaxGuide}}

## CURRENT FILE CONTENT

```text
{{fileContent}}
```

## LINES TO INSERT

```text
{{linesToInsert}}
```

## INSTRUCTIONS

1. Insert the lines above into the appropriate location in the file
2. For LikeC4 (.c4) files: insert component definitions (blocks with `= service/webapp/...`) INSIDE the `model { }` block, BEFORE standalone relationship lines. Insert relationship lines near existing relationship declarations.
3. For Structurizr (.dsl) files: insert component definitions INSIDE the `model { }` block, BEFORE relationship lines. Insert relationship lines near existing relationship declarations.
4. Match the indentation style of the surrounding code
5. Do NOT modify any existing lines
6. Do NOT add comments or explanations
7. Do NOT wrap the output in markdown code fences

Return ONLY the complete modified file content. Nothing else.
