import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StepFunctionsComparisonStack } from '../lib/stacks/stepfunctions-comparison-stack';

const app = new cdk.App();

// 比較用の統合スタックをデプロイ
new StepFunctionsComparisonStack(app, 'StepFunctionsComparisonStack');