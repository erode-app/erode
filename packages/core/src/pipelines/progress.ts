/**
 * Progress reporting abstraction for pipeline functions.
 *
 * CI callers pass SilentProgress; CLI callers pass an Ink-backed reporter.
 */
export interface ProgressReporter {
  section(title: string): void;
  start(message: string): void;
  succeed(message: string): void;
  fail(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

/** No-op progress reporter — swallows every call silently. */
export class SilentProgress implements ProgressReporter {
  section(_title: string): void {
    /* noop */
  }
  start(_message: string): void {
    /* noop */
  }
  succeed(_message: string): void {
    /* noop */
  }
  fail(_message: string): void {
    /* noop */
  }
  warn(_message: string): void {
    /* noop */
  }
  info(_message: string): void {
    /* noop */
  }
}
