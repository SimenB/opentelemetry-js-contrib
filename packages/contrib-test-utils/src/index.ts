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

export {
  assertCloudResource,
  assertContainerResource,
  assertEmptyResource,
  assertHostResource,
  assertK8sResource,
  assertProcessResource,
  assertServiceResource,
  assertTelemetrySDKResource,
} from './resource-assertions';
export { OtlpSpanKind } from './otlp-types';
export {
  createTestNodeSdk,
  runTestFixture,
  TestCollector,
} from './test-fixtures';
export type { TestSpan, RunTestFixtureOptions } from './test-fixtures';
export {
  assertPropagation,
  assertSpan,
  getPackageVersion,
  initMeterProvider,
  TestMetricReader,
} from './test-utils';
export type { TimedEvent } from './test-utils';
export {
  getInstrumentation,
  getTestMemoryExporter,
  getTestSpans,
  mochaHooks,
  registerInstrumentationTesting,
  registerInstrumentationTestingProvider,
  resetMemoryExporter,
  setTestMemoryExporter,
} from './instrumentations';
