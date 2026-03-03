import type React from 'react';
import { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { WizardSelect } from '../ui/components/wizard-select.js';
import { WizardInput } from '../ui/components/wizard-input.js';
import { WizardPathInput } from '../ui/components/wizard-path-input.js';
import { renderApp } from '../ui/app.js';

type WizardStep =
  | 'select-command'
  | 'model-repo'
  | 'model-path'
  | 'extra-args'
  | 'post-action'
  | 'done';

interface WizardState {
  command?: string;
  modelRepo?: string;
  modelPath?: string;
  url?: string;
  repo?: string;
  openPr?: boolean;
  patchLocal?: boolean;
  dryRun?: boolean;
}

const COMMANDS = [
  { label: 'analyze    — Inspect a PR for architectural deviations', value: 'analyze' },
  { label: 'validate   — Verify components are linked to repositories', value: 'validate' },
  { label: 'components — Display all model components', value: 'components' },
  { label: 'connections — Display component relationships', value: 'connections' },
  { label: 'quit       — Close erode', value: 'quit' },
];

const POST_ACTIONS = [
  { label: 'Analyze only', value: 'none' },
  { label: 'Open pull request', value: 'open-pr' },
  { label: 'Patch model files locally', value: 'patch-local' },
  { label: 'Dry run (preview only)', value: 'dry-run' },
];

function needsExtraArgs(command: string): boolean {
  return command === 'analyze' || command === 'connections';
}

/**
 * Run the interactive wizard and return argv-style arguments for Commander to parse.
 * Returns undefined if the user cancels (Ctrl+C).
 */
export async function runInteractiveWizard(): Promise<string[] | undefined> {
  let resolveArgs: (args: string[] | undefined) => void;
  const argsPromise = new Promise<string[] | undefined>((resolve) => {
    resolveArgs = resolve;
  });

  function Wizard(): React.ReactElement {
    const [step, setStep] = useState<WizardStep>('select-command');
    const [state, setState] = useState<WizardState>({});
    const { exit } = useApp();

    function finish(finalState: WizardState): void {
      const args = [finalState.command ?? '', finalState.modelPath ?? ''];
      if (finalState.command === 'analyze' && finalState.url) {
        args.push('--url', finalState.url);
      }
      if (finalState.command === 'analyze' && finalState.modelRepo) {
        args.push('--model-repo', finalState.modelRepo);
      }
      if (finalState.command === 'connections' && finalState.repo) {
        args.push('--repo', finalState.repo);
      }
      if (finalState.openPr) {
        args.push('--open-pr');
      }
      if (finalState.patchLocal) {
        args.push('--patch-local');
      }
      if (finalState.dryRun) {
        args.push('--dry-run');
      }
      resolveArgs(args);
      exit();
    }

    if (step === 'select-command') {
      return (
        <Box flexDirection="column">
          <Text bold>Erode — Architectural Drift Detector</Text>
          <Text dimColor>Choose a command:{'\n'}</Text>
          <WizardSelect
            label=""
            items={COMMANDS}
            onSelect={(value) => {
              if (value === 'quit') {
                resolveArgs(undefined);
                exit();
                return;
              }
              setState((s) => ({ ...s, command: value }));
              setStep(value === 'analyze' ? 'model-repo' : 'model-path');
            }}
          />
        </Box>
      );
    }

    if (step === 'model-repo') {
      return (
        <WizardInput
          key="model-repo"
          label="Model repository URL (leave empty for local):"
          placeholder="https://github.com/owner/model-repo"
          onSubmit={(value) => {
            setState((s) => ({ ...s, modelRepo: value || undefined }));
            setStep('model-path');
          }}
        />
      );
    }

    if (step === 'model-path') {
      const isRemote = !!state.modelRepo;
      return (
        <WizardPathInput
          key="model-path"
          label={
            isRemote
              ? 'Path within the model repository:'
              : 'Directory containing architecture model files:'
          }
          placeholder={isRemote ? '.' : './models'}
          onSubmit={(value) => {
            const modelPath = value || (isRemote ? '.' : './models');
            const next = { ...state, modelPath };
            setState(next);
            if (state.command && needsExtraArgs(state.command)) {
              setStep('extra-args');
            } else {
              finish(next);
            }
          }}
        />
      );
    }

    if (step === 'extra-args') {
      if (state.command === 'analyze') {
        return (
          <WizardInput
            key="extra-args-analyze"
            label="Pull request or merge request URL:"
            placeholder="https://github.com/owner/repo/pull/123"
            onSubmit={(value) => {
              setState((s) => ({ ...s, url: value }));
              setStep('post-action');
            }}
          />
        );
      }

      if (state.command === 'connections') {
        return (
          <WizardInput
            key="extra-args-connections"
            label="Repository address:"
            placeholder="https://github.com/owner/repo"
            onSubmit={(value) => {
              finish({ ...state, repo: value });
            }}
          />
        );
      }
    }

    if (step === 'post-action') {
      return (
        <WizardSelect
          label="What should erode do with detected changes?"
          items={POST_ACTIONS}
          onSelect={(value) => {
            finish({
              ...state,
              openPr: value === 'open-pr',
              patchLocal: value === 'patch-local',
              dryRun: value === 'dry-run',
            });
          }}
        />
      );
    }

    // Fallback — shouldn't reach here
    exit();
    return <Text dimColor>Initializing...</Text>;
  }

  await renderApp(<Wizard />);
  return argsPromise;
}
