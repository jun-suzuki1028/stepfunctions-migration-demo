import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { InlineMapConstruct } from '../constructs/inline-map-construct';
import { DistributedMapConstruct } from '../constructs/distributed-map-construct';

export interface StepFunctionsComparisonStackProps extends cdk.StackProps {
  readonly environment?: string;
  readonly retentionDays?: logs.RetentionDays;
}

export class StepFunctionsComparisonStack extends cdk.Stack {
  public readonly inlineMapStateMachine: sfn.StateMachine;
  public readonly distributedMapStateMachine: sfn.StateMachine;
  public readonly sharedLambdaFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: StepFunctionsComparisonStackProps) {
    super(scope, id, props);

    // 共通関数を使用する理由: 両方のMapタイプで同一の処理ロジックを使い、エラーハンドリングの違いのみを測定するため
    this.sharedLambdaFunction = new lambda.Function(this, 'ProcessItemFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      description: 'Shared processing function with controlled error rate for comparing error handling approaches',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Processing item:', JSON.stringify(event));
          
          // 10%の確率でエラーを発生させる理由: Mapタイプ間のエラーハンドリングの違いを明確に示すため
          if (Math.random() < 0.1) {
            console.error('Controlled error for error handling comparison');
            throw new Error('Simulated processing error to test error handling strategies');
          }
          
          const result = { 
            itemId: event.itemId || 'unknown', 
            status: 'processed',
            processedAt: new Date().toISOString(),
            processingTimeMs: Math.floor(Math.random() * 100) + 50
          };
          
          console.log('Processing completed:', JSON.stringify(result));
          return result;
        };
      `),
      environment: {
        ENVIRONMENT: props?.environment ?? 'demo',
        LOG_LEVEL: 'INFO' // INFOレベルを選択する理由: デモ環境でのデバッグとパフォーマンスバランスを保つため
      },
    });

    // 統一ロググループを使用する理由: 両方のMapタイプのログを集約管理し、比較分析を容易にするため
    const logGroup = new logs.LogGroup(this, 'StepFunctionsLogGroup', {
      logGroupName: `/aws/stepfunctions/${this.stackName}`,
      retention: props?.retentionDays ?? logs.RetentionDays.ONE_WEEK, // 1週間保持する理由: デモ環境でのコスト最適化と十分なデバッグ期間をバランスするため
      removalPolicy: cdk.RemovalPolicy.DESTROY, // DESTROYポリシーを選択する理由: デモリソースのクリーンアップを簡単にし、不要なコストを避けるため
    });

    // Inline Mapを使用する理由: エラー許容なしの厳密なエラーハンドリングが必要なビジネスケースを実証するため
    const inlineMapConstruct = new InlineMapConstruct(this, 'InlineMapConstruct', {
      processItemFunction: this.sharedLambdaFunction,
      logGroup,
      timeout: cdk.Duration.minutes(15), // 15分のタイムアウトを設定する理由: デモデータの処理時間とコストをバランスし、無限実行を防ぐため
    });

    // Distributed Mapを使用する理由: 大量データ処理で高いスループットと一定の失敗許容が求められるケースを実証するため
    const distributedMapConstruct = new DistributedMapConstruct(this, 'DistributedMapConstruct', {
      processItemFunction: this.sharedLambdaFunction,
      logGroup,
      maxConcurrency: 5, // 5に制限する理由: デモ環境でのLambda同時実行数制限とコストを考慮しつつ、並列処理の効果を示すため
      toleratedFailurePercentage: 10, // 10%許容する理由: エラーシミュレーション率と同じ値に設定し、Distributed Mapの失敗許容機能を明確に実証するため
      timeout: cdk.Duration.minutes(15),
    });

    // パブリックプロパティで公開する理由: 他のスタックやテストコードから簡単にアクセスでき、統合テストやパフォーマンス測定を可能にするため
    this.inlineMapStateMachine = inlineMapConstruct.stateMachine;
    this.distributedMapStateMachine = distributedMapConstruct.stateMachine;

  }
}