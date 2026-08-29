import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OrganizationRepository } from "@/repositories/organization-repository";
import { Organization } from "@/domain/entities/organization";
import { MemberRank } from "@/domain/value-objects/member-rank";

type OrganizationRow = {
  id: string;
  clerk_org_id: string;
  name: string;
  representative_name: string;
  phone_number: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line1: string;
  address_line2: string | null;
  invoice_registration_number: string;
  onboarding_completed: boolean;
  rank_code: string;
  billing_anchor_day: number | null;
  stripe_customer_id: string | null;
  initial_fee_paid_rank_code: string | null;
  deleted_at: string | null;
};

function toOrganization(row: OrganizationRow): Organization {
  return Organization.of({
    id: row.id,
    clerkOrgId: row.clerk_org_id,
    name: row.name,
    representativeName: row.representative_name,
    phoneNumber: row.phone_number,
    postalCode: row.postal_code,
    prefecture: row.prefecture,
    city: row.city,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    invoiceRegistrationNumber: row.invoice_registration_number,
    onboardingCompleted: row.onboarding_completed,
    rank: MemberRank.of(row.rank_code),
    billingAnchorDay: row.billing_anchor_day,
    stripeCustomerId: row.stripe_customer_id,
    initialFeePaidRank: row.initial_fee_paid_rank_code
      ? MemberRank.of(row.initial_fee_paid_rank_code)
      : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  });
}

const SELECT_FIELDS =
  "id, clerk_org_id, name, representative_name, phone_number, postal_code, prefecture, city, address_line1, address_line2, invoice_registration_number, onboarding_completed, rank_code, billing_anchor_day, stripe_customer_id, initial_fee_paid_rank_code, deleted_at";

export class SupabaseOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<Organization | null> {
    const { data } = await this.db
      .from("organizations")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .single();
    return data ? toOrganization(data as OrganizationRow) : null;
  }

  async findByClerkOrgId(clerkOrgId: string): Promise<Organization | null> {
    const { data } = await this.db
      .from("organizations")
      .select(SELECT_FIELDS)
      .eq("clerk_org_id", clerkOrgId)
      .single();
    return data ? toOrganization(data as OrganizationRow) : null;
  }

  async findByName(name: string): Promise<Organization | null> {
    const { data } = await this.db
      .from("organizations")
      .select(SELECT_FIELDS)
      .eq("name", name)
      .is("deleted_at", null)
      .maybeSingle();
    return data ? toOrganization(data as OrganizationRow) : null;
  }

  async save(organization: Organization): Promise<void> {
    await this.db.from("organizations").upsert({
      id: organization.id,
      clerk_org_id: organization.clerkOrgId,
      name: organization.name,
      representative_name: organization.representativeName,
      phone_number: organization.phoneNumber,
      postal_code: organization.postalCode,
      prefecture: organization.prefecture,
      city: organization.city,
      address_line1: organization.addressLine1,
      address_line2: organization.addressLine2,
      invoice_registration_number: organization.invoiceRegistrationNumber,
      onboarding_completed: organization.onboardingCompleted,
      rank_code: organization.rank.value,
      billing_anchor_day: organization.billingAnchorDay,
      stripe_customer_id: organization.stripeCustomerId,
      initial_fee_paid_rank_code:
        organization.initialFeePaidRank?.value ?? null,
      deleted_at: organization.deletedAt?.toISOString() ?? null,
    });
  }
}
