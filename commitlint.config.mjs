export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['core', 'cli', 'web', 'architecture', 'eslint-config', 'deps', 'deps-dev', 'release'],
    ],
    'scope-empty': [0],
  },
};
