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

  // Allow $schema key at the top level while blocking unknown keys
  const props = obj['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!props) return;
  props['$schema'] = { type: 'string', description: 'JSON Schema reference' };

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
  const json = JSON.stringify(schema, null, 2) + '\n';

  // --check mode: verify committed schemas are up-to-date
  if (process.argv.includes('--check')) {
    const corePath = path.join(outDir, 'eroderc.schema.json');
    const webPath = path.resolve(
      __dirname,
      '../../../packages/web/public/schemas/v0/eroderc.schema.json'
    );
    const coreContent = fs.readFileSync(corePath, 'utf-8');
    const webContent = fs.readFileSync(webPath, 'utf-8');
    if (coreContent !== json || webContent !== json) {
      console.error('Schema is stale. Run `npm run generate:schema --workspace=packages/core`.');
      process.exit(1);
    }
    console.log('Schema is up-to-date.');
    return;
  }

  // Write to core/schemas
  fs.writeFileSync(outPath, json);
  console.log(`Schema written to ${outPath}`);

  // Also copy to web public
  const webDir = path.resolve(__dirname, '../../../packages/web/public/schemas/v0');
  fs.mkdirSync(webDir, { recursive: true });
  const webPath = path.join(webDir, 'eroderc.schema.json');
  fs.writeFileSync(webPath, json);
  console.log(`Schema copied to ${webPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
