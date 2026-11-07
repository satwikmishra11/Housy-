import { z } from 'zod';

export const ProjectItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  tagline: z.string(),
  slug: z.string(),
  reraNumber: z.string(),
  address: z.string(),
  bhkTypes: z.array(z.string()),
  // Compatibility snake_case fields
  display_name: z.string().optional(),
  rera_number: z.string().optional(),
  bhk_types: z.array(z.string()).optional(),
});
export type ProjectItem = z.infer<typeof ProjectItemSchema>;

export const ProjectConfigurationItemSchema = z.object({
  type: z.string(),
  carpetArea: z.string(),
  priceRange: z.string(),
  specs: z.string(),
});
export type ProjectConfigurationItem = z.infer<typeof ProjectConfigurationItemSchema>;

export const ProjectAmenityItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string().optional(),
});
export type ProjectAmenityItem = z.infer<typeof ProjectAmenityItemSchema>;

export const ProjectPublicFactSchema = z.object({
  key: z.string(),
  title: z.string(),
  value: z.string(),
  category: z.string(),
});
export type ProjectPublicFact = z.infer<typeof ProjectPublicFactSchema>;

export const ProjectDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  tagline: z.string(),
  slug: z.string(),
  reraNumber: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  bhkTypes: z.array(z.string()),
  priceRange: z.string(),
  configurations: z.array(ProjectConfigurationItemSchema),
  amenities: z.array(ProjectAmenityItemSchema),
  facts: z.array(ProjectPublicFactSchema),
  locationLandmarks: z.string().optional(),
  transitConnectivity: z.string().optional(),
  possessionDate: z.string().optional(),
  developerName: z.string().default('Aaranya Realty, Ahmedabad'),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const ProjectDetailResponseSchema = z.object({
  success: z.boolean(),
  data: ProjectDetailSchema,
});
export type ProjectDetailResponse = z.infer<typeof ProjectDetailResponseSchema>;
