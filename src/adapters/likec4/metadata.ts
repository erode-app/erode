import { ErrorCode } from '../../errors.js';
import type { AdapterMetadata } from '../adapter-metadata.js';

export const LIKEC4_METADATA: AdapterMetadata = {
  id: 'likec4',
  displayName: 'LikeC4',
  documentationUrl: 'https://likec4.dev/dsl/links/',
  fileExtensions: ['.c4'],
  pathDescription: 'Path to LikeC4 models directory',
  generatedFileExtension: '.c4',
  prTitleTemplate: 'chore: update LikeC4 model for PR #{{prNumber}}',
  errorSuggestions: {
    [ErrorCode.MODEL_LOAD_ERROR]: [
      'Check the LikeC4 workspace configuration',
      'Verify all .c4 files are valid',
      "Run 'npm run validate' in the LikeC4 directory",
    ],
  },
  noComponentHelpLines: [
    'Add a link directive to a component in your LikeC4 model:',
    "  my_component = service 'My Service' { link {{repoUrl}} }",
    'Multiple components can share the same URL (monorepo support).',
    'Run "erode validate <model-path>" to check your model.',
    'See: https://likec4.dev/dsl/links/',
  ],
  missingLinksHelpLines: [
    'Add a link directive to connect components to their repositories:',
    "  my_component = service 'My Service' { link https://github.com/org/repo }",
    'Multiple components can share the same URL (monorepo support).',
    'See: https://likec4.dev/dsl/links/',
  ],
};
