# 公演のWebプッシュ通知

既存デプロイの `Code.gs` を更新し、`Push.gs` と生成済みの `PushCrypto.gs` を追加します。
既存のデプロイを編集して新しいバージョンを選び、URLと保存先を維持します。

## 管理者端末での確認

1. 既存のApps Scriptプロジェクトに上記の3ファイルを反映します。
2. ローカルのNode.jsで次を実行し、表示された鍵をスクリプト プロパティの `PUSH_PRIVATE_KEY` に設定します。鍵は共有・ログ出力・コミットしません。
   ```sh
   node -e "const e=require('node:crypto').createECDH('prime256v1');e.generateKeys();const k=e.getPrivateKey();console.log(Buffer.concat([Buffer.alloc(32-k.length),k]).toString('base64url'))"
   ```
3. `PUSH_MODE` を `pilot` に設定します。この状態で設定できるのは所有者の管理者アカウントだけです。定期配信は停止した状態です。
4. 更新した帳面を管理者端末で開き、管理者設定で「公演のお知らせを受け取る」を押します。許可後に「テスト通知を送る」を押し、通知欄の表示とタップ時の画面を確認します。iPhoneはiOS 16.4以降でホーム画面から帳面を開きます。
5. 管理者端末での受信確認後、配信を開始する場合は `sendPerformanceNotifications` の時間主導型トリガーを5分おきに設定し、`PUSH_MODE` を `members` に変更します。トリガーが日本時間8時台に起動した際に送ります。配信を停止するには `PUSH_MODE` を `off` にします。

## 運用

- 通知設定は端末ごとです。ログアウト、セッション失効、会員停止後の新規配信は止まります。失効後は、再ログインして通知を有効にし直します。
- 配信時に共有予定を確認し、削除・記録済み・中止フラグのある予定を除外します。日付変更後は新しい日付を使います。送信済みの通知を端末から取り消すことはできません。
- 二重送信防止のため送信前に配信を記録します。通信結果が不明な場合も同じ通知を自動再送しません。Pushサービスが受け付けた後の端末表示は実機で確認します。
- 送信先は非公開スクリプト プロパティに保管します。初期上限は50端末です。期限切れを検出した登録は整理し、配信先から失効が返った場合も削除します。
- 通知には公演名と開催日時が含まれ、ロック画面に出ることがあります。

## 暗号ライブラリの再ビルド

`crypto.mjs` を作業用ディレクトリにコピーし、次の固定バージョンをインストールしてビルドします。MITライセンスは同梱しています。

```sh
npm install --no-save @noble/curves@1.9.7 @noble/ciphers@1.3.0 @noble/hashes@1.8.0 esbuild@0.25.12
npx esbuild crypto.mjs --bundle --minify --platform=browser --format=iife --global-name=NotebookPushCrypto --target=es2020 --outfile=PushCrypto.gs
```
