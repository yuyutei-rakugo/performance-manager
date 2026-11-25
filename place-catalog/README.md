# 神栖市・銚子市の公開検索データ

このディレクトリは、施設を探すための候補です。公演の掲示先・掲示状況・メモ・会員情報ではありません。候補を選んで保存するまで、本番データには追加されません。

## 出典と利用条件

- © OpenStreetMap contributors
- Open Database License 1.0（ODbL-1.0）: https://opendatacommons.org/licenses/odbl/1-0/
- 出典表示: https://www.openstreetmap.org/copyright
- 地域ファイル: https://download.geofabrik.de/asia/japan/kanto.html
- 各ファイルの収録日時・件数・SHA-256・行政境界のOSM IDは `manifest.json` に記録しています。

JSONの検索データおよびその改変版の配布にはODbLの条件が適用されます。アプリの会員データをここへコピーしないでください。Googleマップの施設情報・座標を一括抽出して混ぜないでください。

## 内容と限界

名前のある施設・店舗・公園・交通施設・観光地・地名などを、市の行政境界で切り出しています。名称・別名・公開住所・座標・区分・OSM IDだけを保存し、連絡先や個人情報のタグは収録しません。道路の線形や住宅の所有者一覧ではありません。

OSMにない店、新規開店・閉店・移転、住所の欠落はあります。全店舗を網羅する名簿ではありません。nodeは地図上の点、way/relationは建物・敷地などの代表位置で、入口や掲示する場所を保証しません。画面で場所を確認して登録してください。異なる支店や遠く離れた同名施設は残しています。

## 再作成

Pythonの処理環境だけに `osmium` と `shapely` が必要です。公開アプリには不要です。

```sh
python -m pip install -r scripts/requirements-place-catalog.txt
# Geofabrikから最新の kanto-latest.osm.pbf を取得後:
python scripts/build-place-catalog.py /path/to/kanto-latest.osm.pbf
node tests/regional-places.cjs
```

元のPBFは約500MBで、公開アプリには含めません。加工後の2市の小さなJSONだけを配布します。バージョンを固定した依存環境で再作成し、差分・件数・主要施設とテストを確認してから公開してください。大量データを公共の検索APIへ1件ずつ問い合わせる処理は行いません。

`regional-places.js` は選んだ市だけ読み込み、公開データ専用のCache Storageに保存します。次回以降はメモリーまたは端末内の保存データを使います。新しいmanifestのSHA-256が変わったファイルだけ取得し直します。キャッシュ拒否時はオンライン読込、壊れたキャッシュは再取得、通信断時は保存済みデータを使います。会員の入力をこのキャッシュへ保存するコードはありません。検索データがない場合だけ外部の施設検索に進み、それでも見つからない場所は同じ画面の地図から指定できます。
