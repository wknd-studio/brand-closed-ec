# Contracts: Clerk Webhook Events（追加分）

`src/app/api/webhooks/clerk/route.ts` に、既存の `user.created` ハンドリングと並列で追加するイベント種別。svix署名検証は既存実装をそのまま使う。ベストエフォート配信のため、決定的な操作は各UseCase内でのupsertでも整合性を担保する（R5参照）。

## organization.created

```
event.data.id            -> organizations.clerk_org_id
event.data.name          -> organizations.name
```

`rank` 等の会員情報は含まれない（未払い状態で仮作成）。実際のランク選択は既存の個人向けオンボーディング（`selectPlan`）と対称的な、組織向けの `selectOrganizationPlan` Server Actionで行う。

## organization.deleted

```
event.data.id -> clerk_org_id が一致する organizations.deleted_at をセット
```

## organizationMembership.created / .updated / .deleted

```
event.data.organization.id -> organizations.clerk_org_id で解決
event.data.public_user_data.user_id -> users.clerk_user_id で解決
event.data.role             -> organization_memberships.clerk_role ('org:admin' | 'org:member')
```

`.deleted` の場合、該当メンバーが発注していた `pending_approval` の注文を `rejected` に一括更新する（Edge Cases参照）。
