import { z } from 'zod';

export const PackageJsonSchema = z.object({
  version: z.string(),
});
