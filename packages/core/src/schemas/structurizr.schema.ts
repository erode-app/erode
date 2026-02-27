import { z } from 'zod';

export const StructurizrRelationshipSchema = z
  .object({
    sourceId: z.string(),
    destinationId: z.string(),
    description: z.string().optional(),
    technology: z.string().optional(),
    tags: z.string().optional(),
  })
  .loose();

export type StructurizrRelationship = z.infer<typeof StructurizrRelationshipSchema>;

export const StructurizrComponentSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    technology: z.string().optional(),
    tags: z.string().optional(),
    url: z.string().optional(),
    properties: z.record(z.string(), z.string()).optional(),
    relationships: z.array(StructurizrRelationshipSchema).optional(),
  })
  .loose();

export type StructurizrComponent = z.infer<typeof StructurizrComponentSchema>;

export const StructurizrContainerSchema = StructurizrComponentSchema.extend({
  components: z.array(StructurizrComponentSchema).optional(),
}).loose();

export type StructurizrContainer = z.infer<typeof StructurizrContainerSchema>;

export const StructurizrSoftwareSystemSchema = StructurizrContainerSchema.extend({
  containers: z.array(StructurizrContainerSchema).optional(),
}).loose();

export type StructurizrSoftwareSystem = z.infer<typeof StructurizrSoftwareSystemSchema>;

export const StructurizrPersonSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    tags: z.string().optional(),
    url: z.string().optional(),
    properties: z.record(z.string(), z.string()).optional(),
    relationships: z.array(StructurizrRelationshipSchema).optional(),
  })
  .loose();

export type StructurizrPerson = z.infer<typeof StructurizrPersonSchema>;

const StructurizrModelSchema = z
  .object({
    people: z.array(StructurizrPersonSchema).optional(),
    softwareSystems: z.array(StructurizrSoftwareSystemSchema).optional(),
    relationships: z.array(StructurizrRelationshipSchema).optional(),
  })
  .loose();

export const StructurizrWorkspaceSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    model: StructurizrModelSchema.optional(),
  })
  .loose();

export type StructurizrWorkspace = z.infer<typeof StructurizrWorkspaceSchema>;
