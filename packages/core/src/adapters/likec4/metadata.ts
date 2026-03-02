import { ErrorCode } from '../../errors.js';
import type { AdapterMetadata } from '../adapter-metadata.js';

export const LIKEC4_METADATA: AdapterMetadata = {
  id: 'likec4',
  displayName: 'LikeC4',
  documentationUrl: 'https://likec4.dev/dsl/links/',
  fileExtensions: ['.c4'],
  pathDescription: 'Directory containing LikeC4 model files',
  prTitleTemplate: 'chore: update LikeC4 model for {{sourceRepo}}#{{prNumber}} — {{prTitle}}',
  errorSuggestions: {
    [ErrorCode.MODEL_LOAD_FAILED]: [
      'Review the LikeC4 workspace configuration',
      'Ensure all .c4 files are syntactically correct',
      "Execute 'npm run validate' in the LikeC4 directory",
    ],
  },
  noComponentHelpLines: [
    'Include a link directive on a component in your LikeC4 model:',
    "  my_component = service 'My Service' { link {{repoUrl}} }",
    'Multiple components can share the same URL (monorepo support).',
    'Use "erode validate <model-path>" to verify your model.',
    'See: https://likec4.dev/dsl/links/',
  ],
  missingLinksHelpLines: [
    'Include a link directive to associate components with their repositories:',
    "  my_component = service 'My Service' { link https://github.com/org/repo }",
    'Multiple components can share the same URL (monorepo support).',
    'See: https://likec4.dev/dsl/links/',
  ],
};
