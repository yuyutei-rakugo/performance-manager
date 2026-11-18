# 結友亭 共通保存の設定

現在は cloud-config.json の enabled=false。既存の端末内公演データと、公開済み過去記録を維持する。

Firebase接続後に実施すること：

1. 新規専用プロジェクトをSparkで作成。請求先は関連付けず、有料プランには変更しない。
2. Firestore Standardの無料データベースを作成。Googleログインを有効にする。
3. Authenticationの承認済みドメインに yuyutei-rakugo.github.io を登録する。
4. firestore.rulesをデプロイする。ログインだけでは記録へのアクセスを許可しない。
5. Webアプリの構成をcloud-config.jsonのfirebaseに設定する。管理鍵やサービスアカウントの秘密鍵は保存しない。
6. 管理者のGoogleアカウントをユーザーに確認し、AuthenticationのUIDを取得する。Firestore members/{UID} にactive=trueとrole=adminを管理者権限で設定する。メールアドレスを推測して登録しない。
7. 他の会員も同様にUIDごとに登録。roleはeditor（追加修正可）かviewer（閲覧のみ）。会員自身は権限を書き換えられない。
8. エミュレータまたは専用テストデータで未ログイン・未承認・viewerの書込み拒否、editorの成功、会員失効、同時編集の競合を検証する。
9. enabled=trueで公開し、実機2台でログイン・保存・再表示を確認する。

既存端末内公演データ：共通保存を有効にする前にJSONを書き出す。元のlocalStorageは自動で削除しない。共通保存後に編集権限でJSONを取り込む。サンプル公演は自動転送しない。

過去記録：最初の共通記録保存時に、公開済み49行を含めて移行する。新しい共有記録はFirestoreだけに保存する。既に公開されているhistory-data.jsonの過去記録は公開のまま。

共通保存はshared/eventsとshared/historyの2文書を使い、revision付きトランザクションで競合を検知する。1文書500行まで。オフライン時は共通保存を成功扱いにせず再試行を促す。Cloud Functions・Cloud Storage・SMS認証・Analyticsは使用しない。
