import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { validatePath } from '../utils/validation.js';

export interface ValidateOptions {
  modelPath: string;
  modelFormat?: string;
}

export interface ValidateResult {
  components: {
    id: string;
    title: string;
    kind: string;
    repository: string;
  }[];
  total: number;
  linked: number;
  unlinked: number;
  versionCheck: {
    detected: string | null;
    minimum: string;
    compatible: boolean | null;
  } | null;
  hasIssues: boolean;
}

function findRepositoryLink(links: string[]): string | undefined {
  return links.find((link) => link.includes('github.com') || link.includes('gitlab.com'));
}

export async function runValidate(
  options: ValidateOptions,
  progress?: ProgressReporter
): Promise<ValidateResult> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  // Version check
  let versionCheck: ValidateResult['versionCheck'] = null;
  if (adapter.checkVersion) {
    p.start(`Checking ${adapter.metadata.displayName} version compatibility`);
    const versionResult = adapter.checkVersion(options.modelPath);
    if (versionResult.found && versionResult.compatible) {
      p.succeed(
        `${adapter.metadata.displayName} version ${versionResult.version ?? 'unknown'} is compatible (minimum: ${versionResult.minimum})`
      );
    } else if (versionResult.found && !versionResult.compatible) {
      p.warn(
        `${adapter.metadata.displayName} version ${versionResult.version ?? 'unknown'} is below minimum ${versionResult.minimum}. Update the ${adapter.metadata.id} dependency in the source repo.`
      );
    } else {
      p.warn(
        `Could not detect ${adapter.metadata.displayName} version — skipping compatibility check`
      );
    }
    versionCheck = {
      detected: versionResult.version ?? null,
      minimum: versionResult.minimum,
      compatible: versionResult.compatible ?? null,
    };
  }

  validatePath(options.modelPath, 'directory');

  p.start('Loading architecture model');
  const components = await adapter.loadAndListComponents(options.modelPath);
  p.succeed(`Loaded ${String(components.length)} components`);

  const mapped = components.map((c) => ({
    id: c.id,
    title: c.title ?? c.id,
    kind: c.kind,
    repository: findRepositoryLink(c.links) ?? 'MISSING',
  }));

  const linked = mapped.filter((c) => c.repository !== 'MISSING');
  const unlinked = mapped.filter((c) => c.repository === 'MISSING');

  if (unlinked.length > 0) {
    p.warn(
      `${String(unlinked.length)} of ${String(mapped.length)} component(s) are missing repository links`
    );
    for (const line of adapter.metadata.missingLinksHelpLines) {
      p.info(line);
    }
  } else if (mapped.length > 0) {
    p.succeed('All components have repository links');
  }

  const hasIssues =
    unlinked.length > 0 || (versionCheck !== null && versionCheck.compatible === false);

  return {
    components: mapped,
    total: mapped.length,
    linked: linked.length,
    unlinked: unlinked.length,
    versionCheck,
    hasIssues,
  };
}
