import { toJSONSchema } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Dynamic import is used for ConfigSchema to avoid config.ts side-effects
// at generation time (it reads env vars and throws if missing).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Remove `required` and top-level `additionalProperties: false` so partial
 * configs validate cleanly. The runtime skeleton provides all defaults, so
 * every field is optional in the config file. Inner objects keep
 * `additionalProperties: false` to catch typos.
 */
function relaxSchema(obj: Record<string, unknown>): void {
  // Remove top-level required (all sections are optional)
  delete obj['required'];
  // Allow $schema key at the top level
  delete obj['additionalProperties'];

  const props = obj['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!props) return;

  for (const section of Object.values(props)) {
    if (section && typeof section === 'object' && section['type'] === 'object') {
      // Remove required from inner objects (all fields have defaults or are optional)
      delete section['required'];
      // Recurse into nested objects (e.g., adapter.likec4, adapter.structurizr)
      const innerProps = section['properties'] as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!innerProps) continue;
      for (const inner of Object.values(innerProps)) {
        if (inner && typeof inner === 'object' && inner['type'] === 'object') {
          delete inner['required'];
        }
      }
    }
  }
}

async function main() {
  // Set ERODE_DEBUG_MODE to skip API key validation during schema generation
  process.env['ERODE_DEBUG_MODE'] = 'true';
  const { ConfigSchema } = await import('../src/utils/config.js');

  const generated = toJSONSchema(ConfigSchema, { target: 'draft-07' });

  // Add $schema and metadata
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Erode Configuration',
    description: 'Configuration file for erode (.eroderc.json)',
    ...generated,
  };

  // Remove internal Zod Standard Schema metadata
  delete (schema as Record<string, unknown>)['~standard'];

  // Post-process: make the schema lenient for partial .eroderc.json files.
  // The runtime skeleton fills in all defaults, so nothing is truly required.
  relaxSchema(schema as Record<string, unknown>);

  const outDir = path.resolve(__dirname, '../schemas');
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'eroderc.schema.json');
  fs.writeFileSync(outPath, JSON.stringify(schema, null, 2) + '\n');
  console.log(`Schema written to ${outPath}`);

  // Also copy to web public
  const webDir = path.resolve(__dirname, '../../../packages/web/public/schemas');
  fs.mkdirSync(webDir, { recursive: true });
  const webPath = path.join(webDir, 'eroderc.schema.json');
  fs.writeFileSync(webPath, JSON.stringify(schema, null, 2) + '\n');
  console.log(`Schema copied to ${webPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
