# npm publishing rollout

Publish `@erode-app/core` and `@erode-app/cli` to npm with OIDC trusted
publishers and provenance attestation.

## What's already done

- [x] Rename all workspace packages from `@erode/` to `@erode-app/` scope
- [x] Add `files: ["dist"]` to core and cli package.json
- [x] Add `repository` field to core and cli (required for provenance)
- [x] Add npm publish job to `release.yml` (runs alongside docker build)
- [x] Pin `@erode-app/core` dependency to exact version before publishing cli
- [x] Use OIDC authentication (no NPM_TOKEN)
- [x] Scope `id-token: write` permission to the npm job only
- [x] Update cli-usage.md install instructions
- [x] Update claude-code.md skill and hook examples

## What's left (manual steps)

### 1. Create the npm organization

Go to <https://www.npmjs.com/org/create> and create the `erode-app`
organization (or verify it already exists from the GitHub org linkage).

### 2. Initial publish (one-time, requires a token)

Trusted publishers can only be configured on packages that already exist
on npm. The very first publish must use a granular access token.

1. Create a granular access token on npmjs.com:
   - Go to <https://www.npmjs.com/settings/~/tokens/granular-access-tokens/new>
   - Scope: `@erode-app`
   - Permissions: Read and write
   - Expiration: short (7 days is fine, it's one-time use)

2. Publish both packages locally:

   ```bash
   npm ci && npm run build

   # Set versions (use whatever the first release version will be)
   npm version 0.1.0 --no-git-tag-version --workspace=packages/core
   npm version 0.1.0 --no-git-tag-version --workspace=packages/cli

   # Pin core dependency in cli
   node -e "
     const fs = require('fs');
     const pkg = JSON.parse(fs.readFileSync('packages/cli/package.json', 'utf8'));
     pkg.dependencies['@erode-app/core'] = '0.1.0';
     fs.writeFileSync('packages/cli/package.json', JSON.stringify(pkg, null, 2) + '\n');
   "

   # Publish (order matters: core first, then cli)
   npm publish --workspace=packages/core --access public
   npm publish --workspace=packages/cli --access public
   ```

   When prompted, authenticate with the granular token.

3. Verify both packages exist:

   ```bash
   npm view @erode-app/core
   npm view @erode-app/cli
   ```

4. Revert the local version changes (don't commit them):

   ```bash
   git checkout packages/core/package.json packages/cli/package.json
   ```

### 3. Configure trusted publishers on npmjs.com

For each package (`@erode-app/core` and `@erode-app/cli`):

1. Go to the package settings page on npmjs.com
2. Navigate to **Trusted Publishers** (or **Publishing**)
3. Click **Add trusted publisher**
4. Fill in:
   - **Provider**: GitHub Actions
   - **Repository owner**: `erode-app`
   - **Repository name**: `erode`
   - **Workflow filename**: `release.yml`
   - **Environment**: _(leave blank)_
5. Save

### 4. Delete the granular access token

Go to <https://www.npmjs.com/settings/~/tokens> and revoke the token
created in step 2. It's no longer needed.

### 5. Test the full flow

Trigger a release to verify everything works end-to-end:

1. Merge a conventional commit to `main`
2. Let release-please create the release PR
3. Merge the release PR
4. Verify the `npm` job in the Release workflow succeeds
5. Check that both packages are published with provenance:

   ```bash
   npm view @erode-app/core
   npm view @erode-app/cli
   ```

   Look for the provenance badge on npmjs.com package pages.

### 6. Verify consumer install

```bash
npx @erode-app/cli --help
```

This should download the cli, resolve `@erode-app/core` as a dependency,
and print the help output.

## Gotchas

- If `NPM_TOKEN` is set as a repository secret (even empty), npm will
  try to use it instead of OIDC. Make sure it does not exist.
- Provenance does not work with private GitHub repositories, even when
  publishing public npm packages.
- The trusted publisher config on npmjs.com references the workflow
  filename (`release.yml`). If you rename the workflow file, update the
  trusted publisher config to match.
- `npm publish --workspace=packages/core` resolves the workspace path
  relative to the repo root. The `npm` job checks out the repo root, so
  this works correctly.
- Classic npm tokens were permanently revoked in December 2025. Only
  granular tokens and OIDC work now.

## References

- <https://docs.npmjs.com/trusted-publishers/>
- <https://docs.npmjs.com/generating-provenance-statements/>
- <https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/>
- <https://philna.sh/blog/2026/01/28/trusted-publishing-npm/>
