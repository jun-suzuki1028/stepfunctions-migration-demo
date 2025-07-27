# Step Functions Migration Demo: Inline Map vs Distributed Map

AWS Step Functions における **Inline Map** と **Distributed Map** の比較デモプロジェクトです。
エラーハンドリングの違いとベストプラクティスを実装したCDKコードを提供します。

## 🎯 プロジェクトの目的

- **Inline Map**: 複雑なエラーハンドリングが必要な場合のパターン
- **Distributed Map**: 大規模並列処理に最適化されたパターン
- **CDKベストプラクティス**: 実際のプロダクション環境で使える実装例

## 🏗️ アーキテクチャ

### Inline Map Construct
- **エラー許容**: ゼロトレラント（1つでもエラーがあれば失敗）
- **用途**: 厳密なエラーハンドリングが必要な処理
- **特徴**: 
  - Choice ステートによるシンプルなエラー判定
  - Lambdaを使わないエラー検知実装
  - X-Rayトレーシング対応

### Distributed Map Construct
- **エラー許容**: 設定可能な失敗率許容（デフォルト10%）
- **用途**: 大規模並列処理
- **特徴**: 
  - 高い同時実行数をサポート
  - 失敗許容率の柔軟な設定
  - 最小権限IAMロール

## 📁 プロジェクト構造

```
lib/
├── constructs/
│   ├── inline-map-construct.ts      # Inline Map実装
│   └── distributed-map-construct.ts # Distributed Map実装
└── stacks/
    └── stepfunctions-comparison-stack.ts # メインスタック
```

## 🚀 セットアップ

### 前提条件
- Node.js 18.x以上
- AWS CLI設定済み
- AWS CDK CLI (`npm install -g aws-cdk`)

### インストール

```bash
# 依存関係のインストール
npm install

# TypeScriptコンパイル
npm run build

# CloudFormationテンプレート生成
cdk synth

# AWSへのデプロイ
cdk deploy
```

## 🔧 使用方法

### 1. デプロイ後の実行

```bash
# Inline Map StateMachine実行例
aws stepfunctions start-execution \
  --state-machine-arn <InlineMapStateMachineArn> \
  --input '{"items":[{"itemId":1},{"itemId":2},{"itemId":3}]}'

# Distributed Map StateMachine実行例  
aws stepfunctions start-execution \
  --state-machine-arn <DistributedMapStateMachineArn> \
  --input '{"items":[{"itemId":1},{"itemId":2},{"itemId":3}]}'
```

### 2. エラーシミュレーション

Lambda関数は10%の確率でランダムエラーを発生させます：

- **Inline Map**: 1つでもエラーが発生すると即失敗
- **Distributed Map**: 10%までの失敗を許容して処理継続

## 🛡️ セキュリティとベストプラクティス

### 実装済みベストプラクティス

- ✅ **最小権限の原則**: IAMロールで必要最小限の権限のみ付与
- ✅ **X-Rayトレーシング**: パフォーマンス監視対応
- ✅ **構造化ログ**: CloudWatch Logsでエラーレベルログ出力
- ✅ **タイムアウト設定**: 適切なタイムアウト値設定
- ✅ **型安全性**: TypeScriptによる型安全な実装

### CDK Nag対応（オプション）

```bash
# セキュリティチェック用CDK Nagの追加
npm install cdk-nag

# セキュリティチェック実行
npx ts-node cdk-nag-demo.ts
```

## 📊 出力

デプロイ完了後、以下の値が出力されます：

- `InlineMapStateMachineArn`: Inline Map ステートマシンARN
- `DistributedMapStateMachineArn`: Distributed Map ステートマシンARN  
- `ProcessItemFunctionArn`: 共有Lambda関数ARN
- `LogGroupName`: CloudWatch LogグループName

## 🔍 デバッグとモニタリング

### CloudWatch Logs
- エラーレベルのログが `/aws/stepfunctions/StepFunctionsComparisonStack` に出力
- 実行詳細とエラー内容を確認可能

### X-Ray トレーシング
- 両方のステートマシンでトレーシング有効
- パフォーマンス分析と実行フロー可視化

## 📝 技術仕様

- **CDK Version**: 2.207.0+
- **Runtime**: Node.js 18.x
- **Language**: TypeScript
- **Testing**: Jest
- **AWS Services**: 
  - AWS Step Functions
  - AWS Lambda
  - CloudWatch Logs
  - AWS X-Ray

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🔗 関連リンク

- [AWS Step Functions Developer Guide](https://docs.aws.amazon.com/step-functions/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/)
- [Distributed Map の公式ドキュメント](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-asl-use-map-state-distributed.html)

---

**⚠️ 注意**: このプロジェクトはデモ用途です。本番環境での使用前に、セキュリティ要件と運用要件を十分に検討してください。