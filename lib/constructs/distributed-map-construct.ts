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



    const distributedMap = new sfn.DistributedMap(this, 'DistributedMap', {
      itemsPath: '$.items',
      resultPath: '$.results',
      maxConcurrency: props.maxConcurrency ?? 10,
      toleratedFailurePercentage: props.toleratedFailurePercentage ?? 20,
    });

    const processTask = new tasks.LambdaInvoke(this, 'ProcessTask', {
      lambdaFunction: props.processItemFunction,
      outputPath: '$.Payload',
    });

    distributedMap.itemProcessor(processTask);

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      stateMachineName: `${cdk.Stack.of(this).stackName}-DistributedMapDemo`,
      definitionBody: sfn.DefinitionBody.fromChainable(distributedMap),
      timeout: props.timeout ?? cdk.Duration.minutes(30),
      tracingEnabled: true,
    });
  }
}