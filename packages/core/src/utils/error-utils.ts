export function extractStatusCode(error: Error): number | undefined {
  return 'status' in error && typeof (error as { status: unknown }).status === 'number'
    ? (error as { status: number }).status
    : undefined;
}
