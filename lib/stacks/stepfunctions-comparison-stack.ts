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

    // 共通のLambda関数（デモ用エラーシミュレーション付き）
    this.sharedLambdaFunction = new lambda.Function(this, 'ProcessItemFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      description: 'Demo function for processing items with simulated errors',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Processing item:', JSON.stringify(event));
          
          // 10%の確率でエラーを発生させる（デモ用）
          if (Math.random() < 0.1) {
            console.error('Simulated error for demonstration');
            throw new Error('Random processing error for demo');
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
        LOG_LEVEL: 'INFO'
      },
    });

    // CloudWatch Logsの設定（デモ用）
    const logGroup = new logs.LogGroup(this, 'StepFunctionsLogGroup', {
      logGroupName: `/aws/stepfunctions/${this.stackName}`,
      retention: props?.retentionDays ?? logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // InlineMapのConstruct（エラー許容なし）
    const inlineMapConstruct = new InlineMapConstruct(this, 'InlineMapConstruct', {
      processItemFunction: this.sharedLambdaFunction,
      logGroup,
      timeout: cdk.Duration.minutes(15),
    });

    // DistributedMapのConstruct
    const distributedMapConstruct = new DistributedMapConstruct(this, 'DistributedMapConstruct', {
      processItemFunction: this.sharedLambdaFunction,
      logGroup,
      maxConcurrency: 5, // デモ用：低い同時実行数
      toleratedFailurePercentage: 10, // 10%の失敗を許容
      timeout: cdk.Duration.minutes(15),
    });

    // パブリックプロパティの設定
    this.inlineMapStateMachine = inlineMapConstruct.stateMachine;
    this.distributedMapStateMachine = distributedMapConstruct.stateMachine;

  }
}