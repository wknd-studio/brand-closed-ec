import { useState } from "react";
import { Box, Card, Container, Heading, Label, Stack, Text } from "@sanity/ui";

interface Section {
  title: string;
  body: React.ReactNode;
}

/**
 * 実際の画面のスクリーンショットを表示する。ファイルは`static/product-import-manual/`配下に
 * 置く運用で、Sanity Studioの開発サーバーは`static/`をそのまま`/static/`で配信する
 * （設定不要のデフォルト挙動）。まだファイルが無い場合は壊れた画像アイコンではなく
 * 「未配置」の枠を表示し、あとからファイルを置けば次回表示時に自動的に反映される
 * （ビルド時のJSインポートではなく、実行時の<img>読み込みで判定しているため、
 * 存在しないファイルを参照していてもtypecheck/lint/buildは失敗しない）
 */
function Screenshot({ filename, alt }: { filename: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <Card
        padding={3}
        radius={2}
        tone="transparent"
        style={{ border: "1px dashed #999" }}
      >
        <Text size={0} muted>
          画像未配置（{filename}を static/product-import-manual/
          に置くと自動的に表示されます）
        </Text>
      </Card>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Sanity Studio（Next.jsアプリとは別のVite製アプリ）のコードのためnext/imageは使えない
    <img
      src={`/static/product-import-manual/${filename}`}
      alt={alt}
      style={{
        maxWidth: "100%",
        borderRadius: 4,
        border: "1px solid #d9d9d9",
        display: "block",
      }}
      onError={() => setMissing(true)}
    />
  );
}

/**
 * 1手順=1行の短い指示のみを書く。例外・理由はStepの外（別のTextやCard）に出す。
 * サイズ2（本文より一段階大きい）にして、補足（size 0）とのメリハリを付ける
 */
function Step({ children }: { children: React.ReactNode }) {
  return (
    <Text size={2} as="li">
      {children}
    </Text>
  );
}

/**
 * 指示（1行・やや大きめ）と、その下に補足（1行・小さく薄い注釈）をセットで表示する手順。
 * 文字サイズの差でメリハリを付け、「読むべき指示」と「読み飛ばしてよい補足」を目で区別できるようにする。
 * StackにJSXの`li`をそのまま指定すると`display:flex`でリストマーカーが消えるため、
 * 素の<li>でラップし、その内側だけをStackでフレックス化する
 */
function StepWithNote({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <li>
      <Stack space={2}>
        <Text size={2}>{children}</Text>
        {note && (
          <Text size={0} muted>
            {note}
          </Text>
        )}
      </Stack>
    </li>
  );
}

function StepList({ children }: { children: React.ReactNode }) {
  return (
    <Stack space={4} as="ol" style={{ paddingLeft: "1.25em" }}>
      {children}
    </Stack>
  );
}

/**
 * 「事前準備」「手順A」等、手順のまとまりを枠線付きのカードで視覚的に区切る。
 * 見出しはLabel（小さい大文字風のラベル）にして、本文の手順（size 2）より
 * はっきり格下に見えるようにする
 */
function SubSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding={4} radius={2} border tone="transparent">
      <Stack space={4}>
        <Label size={1}>{label}</Label>
        {children}
      </Stack>
    </Card>
  );
}

const SECTIONS: Section[] = [
  {
    title: "0. まずはここから",
    body: (
      <Stack space={3}>
        <Text size={2}>商品データの登録方法は2種類です。</Text>
        <Stack space={3}>
          <Card padding={4} radius={2} shadow={1}>
            <Text size={2}>
              <b>1件だけ登録・修正する</b> →「1. 商品を1件ずつ手動で登録する」
            </Text>
          </Card>
          <Card padding={4} radius={2} shadow={1}>
            <Text size={2}>
              <b>CSVでまとめて登録・更新する</b> →「3. CSVで一括インポートする」
            </Text>
          </Card>
        </Stack>
      </Stack>
    ),
  },
  {
    title: "1. 商品を1件ずつ手動で登録する",
    body: (
      <Stack space={4}>
        <SubSection label="事前準備（ブランドがまだ無い場合のみ）">
          <StepList>
            <Step>「商品管理 → ブランド」を開く</Step>
            <Step>右上の「＋ 新規作成」を押す</Step>
            <StepWithNote note="ロゴ画像・説明文・デザインテーマは空欄のままでよい">
              「ブランド名」を入力する（必須）
            </StepWithNote>
            <Step>右下の「公開（Publish）」を押して保存する</Step>
          </StepList>
          <Screenshot
            filename="brand-new-form.png"
            alt="ブランドの新規作成フォーム"
          />
        </SubSection>

        <SubSection label="商品を1件作成する">
          <StepList>
            <Step>「商品管理 → すべての商品」を開く</Step>
            <Step>右上の「＋ 新規作成」を押す</Step>
            <Step>「商品名」を入力する（必須）</Step>
            <StepWithNote note="事前に作成したブランドの中から選ぶ">
              「ブランド」をプルダウンから選ぶ（必須）
            </StepWithNote>
            <Step>「参考小売価格（円）」に定価を入力する（必須）</Step>
            <Step>「在庫状況」をプルダウンから選ぶ</Step>
            <Step>「最低閲覧ランク」をプルダウンから選ぶ</Step>
            <StepWithNote note="計算の仕組みは「2. 価格・掛け率の仕組み」を参照。この欄は直接入力しない">
              「ランク別仕入れ価格」は自動計算されるので、そのままにする
            </StepWithNote>
            <StepWithNote note="押せない場合は、画面上部の警告に入力漏れの項目が出ている">
              右下の「公開（Publish）」を押して保存する
            </StepWithNote>
          </StepList>
          <Screenshot
            filename="product-new-form.png"
            alt="商品の新規作成フォーム"
          />
        </SubSection>

        <Card padding={4} radius={2} tone="primary">
          <Text size={1}>
            業者からCSVをもらえる場合は、1件ずつ登録するより「3.
            CSVで一括インポートする」の方が早く、入力ミスも防げます。
          </Text>
        </Card>
      </Stack>
    ),
  },
  {
    title: "2. 価格・掛け率の仕組み",
    body: (
      <Stack space={4}>
        <Text size={2}>
          「ランク別仕入れ価格」欄は手入力ではなく自動計算です。以下の優先順位で決まります（上が優先）。
        </Text>
        <StepList>
          <Step>商品自身に設定した「ランク別掛け率」</Step>
          <Step>商品にアタッチした「掛け率設定」</Step>
          <Step>ブランドにアタッチした「掛け率設定」</Step>
          <Step>
            「商品管理 →
            価格設定（デフォルト掛け率）」で「デフォルトにする」がONの設定
          </Step>
        </StepList>
        <Text size={0} muted>
          定価または掛け率を変更して保存すると、そのたびに自動で再計算されます。
        </Text>
        <Card padding={4} radius={2} tone="caution">
          <Text size={1}>
            「仕入れ掛け率（%）※運営者専用」は会員向け価格の計算には使いません。業者の仕入れ値の参考情報です。この値を下回るランク価格は、赤字防止のため保存時にエラーになります。
          </Text>
        </Card>
      </Stack>
    ),
  },
  {
    title: "3. CSVで一括インポートする",
    body: (
      <Stack space={4}>
        <Text size={2}>新規追加・既存商品の更新のどちらも同じ手順です。</Text>

        <SubSection label="手順A: カタログを準備する（業者ごとに最初の1回だけ）">
          <StepList>
            <StepWithNote note="詳しくは「1. 商品を1件ずつ手動で登録する」参照">
              ブランドが未登録の場合は先に作成する
            </StepWithNote>
            <Step>「商品管理 → 商品CSVカタログ」を開く</Step>
            <Step>右上の「＋ 新規作成」を押す</Step>
            <StepWithNote note="例:「A社 定期CSV（Nike分）」">
              「表示名」に業者名など分かりやすい名前を入力する
            </StepWithNote>
            <StepWithNote note="CSVにブランド列があれば、そちらが優先される">
              ブランド列が無いCSVは「デフォルトブランド」を設定する
            </StepWithNote>
            <StepWithNote note="このファイルがそのまま下の列マッピングのプレビューにも使われる">
              「保留中のCSV」欄に、その業者の実際のCSVファイルをアップロードする
            </StepWithNote>
            <StepWithNote note="通常はそのまま1でよい">
              先頭に案内文や空行があるCSVは「ヘッダー行の行番号」を設定する
            </StepWithNote>
            <StepWithNote note="対応する列が無い項目は空欄でよい">
              「CSV列マッピング」で、プレビューされた列名からJANコード・商品名・ブランド名・定価・在庫状況・仕入れ掛け率・入数の各項目を選ぶ
            </StepWithNote>
            <Step>右下の「公開（Publish）」を押して保存する</Step>
          </StepList>
          <Screenshot
            filename="csv-catalog-mapping.png"
            alt="商品CSVカタログのCSV列マッピング設定画面"
          />
        </SubSection>

        <SubSection label="手順B: CSVを取り込む（毎回の作業）">
          <StepList>
            <Step>上部タブの「商品CSVインポート」を開く</Step>
            <StepWithNote note="保留中のCSVが自動的に読み込まれる（「4. 保留中のCSVについて」参照）。無ければ先に手順Aで保存する">
              「1. 商品データソースを選択」でカタログを選ぶ
            </StepWithNote>
            <StepWithNote note="この時点ではまだ商品データは変更されない">
              「2. 検証プレビューを表示する」を押す
            </StepWithNote>
            <Step>
              表示された「成功見込み／エラー見込み」の件数とエラー内容を確認する
            </Step>
            <StepWithNote note="ここで初めて商品データが作成・更新される">
              問題なければ「3. 実行を確定する」を押す
            </StepWithNote>
            <StepWithNote note="あとから見返す場合は「商品管理 → インポート実行結果」（「5. インポート実行結果の見方」参照）">
              「新規作成／更新」の件数が表示されたら完了
            </StepWithNote>
          </StepList>
          <Stack space={3}>
            <Screenshot
              filename="csv-import-preview.png"
              alt="検証プレビューの表示画面"
            />
            <Screenshot
              filename="csv-import-result.png"
              alt="インポート完了メッセージ"
            />
          </Stack>
        </SubSection>

        <Card padding={4} radius={2} tone="critical">
          <Stack space={2}>
            <Text size={1} weight="semibold">
              確定操作は取り消せません
            </Text>
            <Text size={1}>
              「検証プレビューを表示する」の段階では商品データは変わりません。内容を確認してから「実行を確定する」を押してください。
            </Text>
          </Stack>
        </Card>

        <Card padding={4} radius={2} tone="caution">
          <Stack space={2}>
            <Text size={1} weight="semibold">
              同じCSVを再度取り込むと何が起きるか
            </Text>
            <Text size={1}>
              JANコード（無ければ商品名＋ブランド名）が一致する既存商品は、定価・在庫状況・仕入れ掛け率・入数が最新CSVの内容で上書きされます。支払いタイミング・ランク別仕入れ価格・最低閲覧ランクは、運営者が手動調整した値がそのまま維持されます（消えません）。
            </Text>
          </Stack>
        </Card>
      </Stack>
    ),
  },
  {
    title: "4. 保留中のCSVについて",
    body: (
      <Stack space={4}>
        <Text size={2}>
          各「商品CSVカタログ」は、まだインポートを確定していないCSVを1件だけ保留できます。2つの経路で作られます。
        </Text>
        <StepList>
          <StepWithNote note="運営者側の操作は不要">
            <b>自動スクレイピング</b>:
            CSVを提供してくれない業者について、毎日自動で情報を収集し、対応するカタログに保留される
          </StepWithNote>
          <StepWithNote note="「商品管理 → 商品CSVカタログ」でそのカタログを開き、「保留中のCSV」欄からファイルを登録する">
            <b>手元のCSVの事前保存</b>: 受け取ったCSVを、取り込み作業の前に
            Sanity上へ置いておける
          </StepWithNote>
        </StepList>
        <Card padding={4} radius={2} tone="primary">
          <Stack space={2}>
            <Text size={1} weight="semibold">
              自動で商品データに反映されることはありません
            </Text>
            <Text size={1}>
              「3.
              CSVで一括インポートする」の手順Bでカタログを選ぶと、保留中のCSVがあれば自動的に読み込まれます。そこから検証プレビュー→確定の操作を行って初めて商品データに反映されます。無人実行の結果をそのまま反映しないための仕組みです。確定すると保留は解除されます。
            </Text>
          </Stack>
        </Card>
      </Stack>
    ),
  },
  {
    title: "5. インポート実行結果の見方",
    body: (
      <Stack space={3}>
        <Text size={2}>
          「商品管理 →
          インポート実行結果」で、CSV手動インポート・自動スクレイピングどちらの履歴も確認できます。各項目をクリックすると、対象カタログ・実行契機・実行日時・成功件数・失敗件数・エラー詳細が見られます。
        </Text>
        <Text size={0} muted>
          監査用の記録のため編集はできません（削除のみ可能です）。
        </Text>
        <Screenshot
          filename="import-run-detail.png"
          alt="インポート実行結果の詳細画面"
        />
      </Stack>
    ),
  },
  {
    title: "6. 商品の絞り込み・一括削除",
    body: (
      <Stack space={3}>
        <Text size={2}>
          「商品管理 →
          すべての商品」の一覧右上のフィルタアイコンから、在庫状況・ブランド・カテゴリなどで絞り込めます。
        </Text>
        <Text size={2}>
          一覧上部の「Select」で複数選択モードになり、まとめて削除できます。
        </Text>
      </Stack>
    ),
  },
];

/**
 * 商品登録・CSVインポート等の運用手順を、開発者でなくても読めるようにする
 * Sanity Studioのツールタブ（ユーザーからの要望: 「画面上のタブにマニュアルを」）。
 * ドキュメントの中身ではなく、Studioの使い方そのものを説明するための静的コンテンツなので、
 * 特定のドキュメントに依存しない独立したツールとして実装している。
 * 各手順は「1行の短い指示」＋「補足は別行の小さい注釈」に分離し、長文の詰め込みを避ける
 * （ユーザーからのフィードバック: 文字数を増やしても読みやすさにはならない）。
 */
export function ManualTool() {
  return (
    <Container width={2} padding={4}>
      <Stack space={5}>
        <Heading size={3}>運用マニュアル</Heading>
        <Text size={1} muted>
          商品登録・CSVインポートなどの運用手順をまとめています。初めて操作する方は、上から順番に読み進めてください。
        </Text>
        {SECTIONS.map((section) => (
          <Card key={section.title} padding={4} radius={3} shadow={1}>
            <Stack space={4}>
              <Heading size={2}>{section.title}</Heading>
              <Box>{section.body}</Box>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
