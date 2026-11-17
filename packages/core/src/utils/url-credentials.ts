/**
 * Remove username and password from a user-supplied repo URL. Inputs that are not
 * absolute URLs (`owner/repo`, scp-style `git@host:o/r`) carry no secret and pass through.
 */
export function stripUrlUserinfo(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (!url.username && !url.password) return input;
  url.username = '';
  url.password = '';
  return url.toString();
}

/** Redact `user:token@` from `scheme://` URLs embedded in free text such as git error output. */
export function redactUrlCredentials(message: string): string {
  return message.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1');
}
