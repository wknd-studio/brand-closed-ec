# Contracts: Server Actions / UseCase

内部Webアプリのため公開APIは持たない。代わりに、既存の（移行済みの）レイヤードアーキテクチャ（`src/use-cases/`、フラット構成）に沿って追加されるUseCase層の契約をここに定義する。実装詳細（DB操作の中身等）はtasksフェーズ・実装フェーズで詰める。

## resolveMemberContext（ランク参照の一元化窓口、R11・FR-024）

新規のUseCaseではなく、`src/domain/services/member-context-resolver.ts` に置く関数。既存コードが`user.rank`を直接参照している全箇所（商品カタログ閲覧制御・チェックアウト・月次上限計算）をこの関数経由に置き換える。

```ts
interface MemberContext {
  scope: "individual" | "organization";
  rank: MemberRank;
  monthlyLimit: Money;
  organizationId?: string; // scope === "organization" の場合のみ
}

function resolveMemberContext(
  user: User,
  activeOrganization: Organization | null // null固定 = 個人会員
): MemberContext;
```

- `activeOrganization`が`null`の場合、個人会員として`user.rank`をそのまま返す（既存の個人会員フローと完全に同一の値・挙動）。
- `activeOrganization`が指定される場合、`organization.rank`を返す（`user.rank`は一切参照しない）。

## CreateOrganizationUseCase

代表者のセルフサインアップ時に呼ばれる（User Story 1）。

```ts
interface CreateOrganizationParams {
  clerkUserId: string;
  organizationName: string;
  representativeName: string;
  phoneNumber: string;
  address: {
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine1: string;
    addressLine2?: string;
  };
  invoiceRegistrationNumber: string; // "T" + 13桁数字（FR-021）
}

type CreateOrganizationResult =
  | { type: "created"; organizationId: string }
  | {
      type: "error";
      reason:
        | "duplicate_name"
        | "invalid_invoice_registration_number"
        | "clerk_api_error";
    };
```

## InviteMemberUseCase

org:adminによる追加メンバー招待（User Story 2）。

```ts
interface InviteMemberParams {
  actingUserId: string; // 呼び出し元。org:adminであることを検証する
  organizationId: string;
  inviteeEmail: string;
}

type InviteMemberResult =
  | { type: "invited" }
  | {
      type: "error";
      reason:
        | "not_admin"
        | "already_member"
        | "invitee_already_individual_member"
        | "clerk_api_error";
    }; // FR-023
```

## PlaceOrderUseCase（拡張）

既存の `PlaceOrderUseCase`（`src/use-cases/place-order.ts`）を拡張し、組織コンテキストで動作する場合は組織スコープで動作する。個人会員と法人組織メンバーは排他的（FR-022）なので、`clerkUserId`が1件でも`organization_memberships`を持つ場合、`activeOrganizationId`は必須（そのユーザーに個人購入モードは存在しない）。

```ts
interface PlaceOrderParams {
  clerkUserId: string;
  activeOrganizationId?: string; // 個人会員はundefined固定。法人組織メンバーは必須（複数所属時はどの組織かを指定）
  cartItems: CartItem[];
  shippingAddressId: string;
  billingAddressId: string;
}
```

- `activeOrganizationId` が指定される場合、月次上限チェックは `MonthlyLimitService` の組織スコープ集計を使う。
- 呼び出し元の `clerk_role` が `org:member` なら `approval_status = pending_approval` で確定し、Checkout/Invoiceフローには進まない。
- `org:admin` なら `approval_status = auto_approved` で既存フローにそのまま進む。

## ApproveOrderUseCase / RejectOrderUseCase

org:adminによる承認・却下（User Story 3）。

```ts
interface ApproveOrderParams {
  actingUserId: string; // org:adminであることを検証する
  orderId: string;
}

type ApproveOrderResult =
  | { type: "approved" }
  | {
      type: "error";
      reason:
        | "not_admin"
        | "not_pending_approval"
        | "requester_no_longer_member";
    }; // FR-018
```

```ts
interface RejectOrderParams {
  actingUserId: string;
  orderId: string;
  reason?: string;
}
```

## CompleteProfileUseCase

個人会員・法人代表者・法人一般担当者いずれも共通で使う、氏名・電話番号入力完了の処理（User Story 2）。

```ts
interface CompleteProfileParams {
  clerkUserId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

type CompleteProfileResult =
  | { type: "completed" }
  | { type: "error"; reason: "validation_error" };
```

`middleware.ts` 側は、`users.first_name` / `last_name` / `phone_number` のいずれかが空の場合にこのUseCaseの入力画面へリダイレクトする（R7参照）。新規サインアップはオンボーディング完了フローの一部として、既存会員は次回ログイン時のゲートとして同じUseCaseを呼ぶ。

**既存不備の是正（R9）**: `src/use-cases/select-plan.ts` はすでに`firstName`/`lastName`を受け取っているが、`User`エンティティに永続化されず握りつぶされている。本UseCase実装時に、`User`エンティティへのフィールド追加と`UserRepository`実装のマッピング追加を合わせて行う。

## LeaveOrganizationUseCase（既存 `withdraw.ts` の拡張）

新規のUseCaseファイルではなく、既存の `src/use-cases/withdraw.ts` に条件を追加する（R6）。既存の `ActiveOrdersExistError` チェックと同じ早期リターンパターンで `SoleAdminCannotLeaveError` を追加する。

```ts
// withdraw.ts の戻り値を拡張（現状はvoidを返すのみ）
type WithdrawResult =
  | { type: "left" }
  | { type: "organization_closed" } // 自分が唯一のメンバーだった場合（FR-017）
  | {
      type: "error";
      reason: "active_orders_exist" | "sole_admin_must_promote_another_member";
    };
```
