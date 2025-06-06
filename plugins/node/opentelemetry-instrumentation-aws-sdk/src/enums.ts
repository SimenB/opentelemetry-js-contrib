/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export enum AttributeNames {
  AWS_OPERATION = 'aws.operation',
  CLOUD_REGION = 'cloud.region',
  AWS_SERVICE_API = 'aws.service.api',
  AWS_SERVICE_NAME = 'aws.service.name',
  AWS_SERVICE_IDENTIFIER = 'aws.service.identifier',
  AWS_REQUEST_ID = 'aws.request.id',
  AWS_REQUEST_EXTENDED_ID = 'aws.request.extended_id',
  AWS_SIGNATURE_VERSION = 'aws.signature.version',

  // TODO: Add these semantic attributes to:
  // - https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-semantic-conventions/src/trace/SemanticAttributes.ts
  // For S3, see specification: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/object-stores/s3.md
  AWS_S3_BUCKET = 'aws.s3.bucket',
  AWS_KINESIS_STREAM_NAME = 'aws.kinesis.stream.name',
}
