import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface InlineMapConstructProps {
  readonly processItemFunction: lambda.Function;
  readonly logGroup: logs.LogGroup;
  readonly timeout?: cdk.Duration;
}

export class InlineMapConstruct extends Construct {
  public readonly stateMachine: sfn.StateMachine;
  public readonly errorHandlingMap: sfn.Map;

  constructor(scope: Construct, id: string, props: InlineMapConstructProps) {
    super(scope, id);

    // InlineMapの設定
    this.errorHandlingMap = new sfn.Map(this, 'ErrorHandlingMap', {
      itemsPath: '$.items',
      resultPath: '$.results',
      comment: 'Process items with error tolerance',
    });

    // Lambda関数呼び出しタスク（エラーハンドリング付き）
    const processTask = new tasks.LambdaInvoke(this, 'ProcessItemTask', {
      lambdaFunction: props.processItemFunction,
      resultPath: '$.processResult',
      comment: 'Process individual item with Lambda',
      retryOnServiceExceptions: true,
    });

    // エラー時のフォールバック処理
    const errorFallback = new sfn.Pass(this, 'ErrorFallback', {
      resultPath: '$.processResult',
      result: sfn.Result.fromObject({ 
        status: 'error',
        timestamp: sfn.JsonPath.stringAt('$$.State.EnteredTime')
      }),
      comment: 'Handle processing errors gracefully',
    });

    // エラーキャッチングの設定
    processTask.addCatch(errorFallback, {
      errors: ['States.ALL'],
      resultPath: '$.errorDetails',
    });

    this.errorHandlingMap.itemProcessor(processTask);

    // 成功時の最終状態
    const successState = new sfn.Pass(this, 'ProcessingComplete', {
      result: sfn.Result.fromObject({ 
        status: 'completed',
        completedAt: sfn.JsonPath.stringAt('$$.State.EnteredTime')
      }),
      comment: 'Mark processing as successfully completed',
    });

    // 結果の準備（エラー許容なし）
    const prepareResults = new sfn.Pass(this, 'PrepareResults', {
      parameters: {
        'inputItems.$': '$.items',
        'processedResults.$': '$.results',
        'summary': {
          'timestamp.$': '$$.State.EnteredTime',
          'executionName.$': '$$.Execution.Name'
        }
      },
      comment: 'Prepare results for error checking (zero tolerance)',
    });

    // エラーチェック
    const errorCheck = new sfn.Choice(this, 'CheckForErrors', {
      comment: 'Check for any processing errors - zero tolerance',
    })
      .when(
        sfn.Condition.isPresent('$.processedResults[0].errorDetails'),
        new sfn.Fail(this, 'ProcessingFailed', {
          error: 'ProcessingFailed',
          cause: 'Processing failed - no errors are tolerated',
        })
      )
      .otherwise(successState);

    // ワークフローの定義
    const definition = this.errorHandlingMap
      .next(prepareResults)
      .next(errorCheck);

    // ステートマシンの定義
    this.stateMachine = new sfn.StateMachine(this, 'InlineMapStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineName: `${cdk.Stack.of(this).stackName}-InlineMapDemo`,
      comment: 'Inline Map with zero error tolerance',
      logs: {
        destination: props.logGroup,
        level: sfn.LogLevel.ERROR,
      },
      timeout: props.timeout ?? cdk.Duration.minutes(30),
      tracingEnabled: true,
    });
  }
}