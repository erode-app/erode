import { ErrorCode } from '../../errors.js';
import type { AdapterMetadata } from '../adapter-metadata.js';

export const STRUCTURIZR_METADATA: AdapterMetadata = {
  id: 'structurizr',
  displayName: 'Structurizr',
  documentationUrl: 'https://docs.structurizr.com/dsl/language',
  fileExtensions: ['.dsl', '.json'],
  pathDescription: 'Path to a Structurizr workspace directory or file (.dsl or pre-exported .json)',
  prTitleTemplate: 'chore: update Structurizr model for {{sourceRepo}}#{{prNumber}} — {{prTitle}}',
  errorSuggestions: {
    [ErrorCode.MODEL_LOAD_FAILED]: [
      'For .dsl files: ensure Structurizr is available (STRUCTURIZR_CLI_PATH or Docker)',
      'For .json files: ensure the file is a valid Structurizr JSON export',
      'Or pre-export: java -jar structurizr.war export -workspace workspace.dsl -format json',
    ],
  },
  noComponentHelpLines: [
    'Include a url property on a component in your Structurizr DSL model:',
    '  webapp = container "Web App" {',
    '    url "https://github.com/org/repo"',
    '  }',
    'Multiple components can share the same URL (monorepo support).',
    'Use "erode validate <model-path>" to verify your model.',
    'See: https://docs.structurizr.com/dsl/language#url',
  ],
  missingLinksHelpLines: [
    'Include a url property to associate components with their repositories:',
    '  webapp = container "Web App" {',
    '    url "https://github.com/org/repo"',
    '  }',
    'Multiple components can share the same URL (monorepo support).',
    'See: https://docs.structurizr.com/dsl/language#url',
  ],
};
