import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface DistributedMapConstructProps {
  readonly processItemFunction: lambda.Function;
  readonly logGroup: logs.LogGroup;
  readonly maxConcurrency?: number;
  readonly toleratedFailurePercentage?: number;
  readonly timeout?: cdk.Duration;
}

export class DistributedMapConstruct extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: DistributedMapConstructProps) {
    super(scope, id);

    // Distributed Mapを選択する理由: 大量のアイテムを高い同時実行数で処理し、一定の失敗率を許容しながら全体のスループットを最大化するため
    const distributedMap = new sfn.DistributedMap(this, 'DistributedMap', {
      itemsPath: '$.items',
      resultPath: '$.results',
      maxConcurrency: props.maxConcurrency ?? 10,
      toleratedFailurePercentage: props.toleratedFailurePercentage ?? 20,
    });

    // シンプルなタスク定義を選択する理由: Distributed Mapが失敗率でエラーを自動管理するため、個別のアイテムレベルでの複雑なエラーハンドリングは不要であるため
    const processTask = new tasks.LambdaInvoke(this, 'ProcessTask', {
      lambdaFunction: props.processItemFunction,
      outputPath: '$.Payload',
    });

    distributedMap.itemProcessor(processTask);

    // CDKデフォルトロールを使用する理由: Distributed Mapの基本機能にはデフォルトロールで十分であり、過度な権限設定を避けるため
    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: `${cdk.Stack.of(this).stackName}-DistributedMapDemo`,
      definitionBody: sfn.DefinitionBody.fromChainable(distributedMap),
      timeout: props.timeout ?? cdk.Duration.minutes(30),
      tracingEnabled: true, // X-Rayトレーシングを有効化する理由: 大量処理のパフォーマンスボトルネックを特定し、スケーリング最適化を行うため
    });
  }
}