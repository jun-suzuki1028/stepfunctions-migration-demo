import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // DistributedMap用のIAMロール（最小権限の原則に従い、より具体的な権限を設定）
    const stateMachineRole = new iam.Role(this, 'StateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'IAM role for DistributedMap StateMachine',
    });

    // CloudWatch Logsへの権限を付与
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogDelivery',
          'logs:GetLogDelivery',
          'logs:UpdateLogDelivery',
          'logs:DeleteLogDelivery',
          'logs:ListLogDeliveries',
          'logs:PutResourcePolicy',
          'logs:DescribeResourcePolicies',
          'logs:DescribeLogGroups',
        ],
        resources: ['*'],
      })
    );

    // Lambda関数呼び出し権限を付与
    props.processItemFunction.grantInvoke(stateMachineRole);

    // DistributedMapの設定（設定可能なパラメーターを追加）
    const distributedMap = new sfn.DistributedMap(this, 'DistributedMap', {
      itemsPath: '$.items',
      resultPath: '$.results',
      maxConcurrency: props.maxConcurrency ?? 10,
      toleratedFailurePercentage: props.toleratedFailurePercentage ?? 20,
    });

    // シンプルなLambda呼び出し（エラーハンドリング不要）
    const processTask = new tasks.LambdaInvoke(this, 'ProcessTask', {
      lambdaFunction: props.processItemFunction,
      outputPath: '$.Payload',
    });

    distributedMap.itemProcessor(processTask);

    // ステートマシンの定義（より適切な設定とセキュリティ）
    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: `${cdk.Stack.of(this).stackName}-DistributedMapDemo`,
      definitionBody: sfn.DefinitionBody.fromChainable(distributedMap),
      role: stateMachineRole,
      logs: {
        destination: props.logGroup,
        level: sfn.LogLevel.ERROR, // 本番環境では ERROR レベルに設定
        includeExecutionData: false, // セキュリティのため実行データは含めない
      },
      timeout: props.timeout ?? cdk.Duration.minutes(30),
      tracingEnabled: true, // AWS X-Rayトレーシングを有効化
    });
  }
}