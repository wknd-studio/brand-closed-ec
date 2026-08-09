import type { Organization } from "@/domain/entities/organization";

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findByClerkOrgId(clerkOrgId: string): Promise<Organization | null>;
  findByName(name: string): Promise<Organization | null>;
  save(organization: Organization): Promise<void>;
}
