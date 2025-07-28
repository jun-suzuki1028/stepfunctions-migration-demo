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

    this.errorHandlingMap = new sfn.Map(this, 'ErrorHandlingMap', {
      itemsPath: '$.items',
      resultPath: '$.results',
      comment: 'Process items with error tolerance',
    });

    const processTask = new tasks.LambdaInvoke(this, 'ProcessItemTask', {
      lambdaFunction: props.processItemFunction,
      resultPath: '$.processResult',
      comment: 'Process individual item with Lambda',
      retryOnServiceExceptions: true,
    });

    const errorFallback = new sfn.Pass(this, 'ErrorFallback', {
      resultPath: '$.processResult',
      result: sfn.Result.fromObject({ 
        status: 'error',
        timestamp: sfn.JsonPath.stringAt('$$.State.EnteredTime')
      }),
      comment: 'Handle processing errors gracefully',
    });

    processTask.addCatch(errorFallback, {
      errors: ['States.ALL'],
      resultPath: '$.errorDetails',
    });

    this.errorHandlingMap.itemProcessor(processTask);

    const successState = new sfn.Pass(this, 'ProcessingComplete', {
      result: sfn.Result.fromObject({ 
        status: 'completed',
        completedAt: sfn.JsonPath.stringAt('$$.State.EnteredTime')
      }),
      comment: 'Mark processing as successfully completed',
    });

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

    const errorCheck = new sfn.Choice(this, 'CheckForErrors', {
      comment: 'Zero tolerance approach: complete failure is safer than partial success for data integrity',
    })
      .when(
        sfn.Condition.isPresent('$.processedResults[0].errorDetails'),
        new sfn.Fail(this, 'ProcessingFailed', {
          error: 'ProcessingFailed',
          cause: 'Zero tolerance policy: any processing error triggers complete workflow failure',
        })
      )
      .otherwise(successState);

    const definition = this.errorHandlingMap
      .next(prepareResults)
      .next(errorCheck);

    this.stateMachine = new sfn.StateMachine(this, 'InlineMapStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineName: `${cdk.Stack.of(this).stackName}-InlineMapDemo`,
      comment: 'Demonstrates strict error handling with zero tolerance for business-critical workflows',
      logs: {
        destination: props.logGroup,
        level: sfn.LogLevel.ERROR,
      },
      timeout: props.timeout ?? cdk.Duration.minutes(30),
      tracingEnabled: true,
    });
  }
}