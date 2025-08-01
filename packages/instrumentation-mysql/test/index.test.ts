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

import { context, Context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  DBSYSTEMVALUES_MYSQL,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_USER,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { MySQLInstrumentation, MySQLInstrumentationConfig } from '../src';
import * as sinon from 'sinon';

const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

const instrumentation = new MySQLInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as mysqlTypes from 'mysql';
import { AttributeNames } from '../src/AttributeNames';

describe('mysql@2.x-Tracing', () => {
  let contextManager: AsyncLocalStorageContextManager;
  let connection: mysqlTypes.Connection;
  let pool: mysqlTypes.Pool;
  let poolCluster: mysqlTypes.PoolCluster;
  // assumes local mysql db is already available in CI or
  // using `npm run test-services:start` script
  const shouldTest = process.env.RUN_MYSQL_TESTS;
  const memoryExporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });

  before(function (done) {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    } else {
      done();
    }
  });

  beforeEach(() => {
    instrumentation.disable();
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    connection = mysqlTypes.createConnection({
      port,
      user,
      host,
      password,
      database,
    });
    pool = mysqlTypes.createPool({
      port,
      user,
      host,
      password,
      database,
    });
    poolCluster = mysqlTypes.createPoolCluster();
    poolCluster.add('name', {
      port,
      user,
      host,
      password,
      database,
    });
  });

  afterEach(done => {
    context.disable();
    memoryExporter.reset();
    instrumentation.disable();
    connection.end(() => {
      pool.end(() => {
        poolCluster.end(() => {
          done();
        });
      });
    });
  });

  describe('when the query is a string', () => {
    it('should name the span accordingly ', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = connection.query(sql);

        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans[0].name, 'SELECT');
          done();
        });
      });
    });
  });

  describe('when the query is an object', () => {
    it('should name the span accordingly ', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        const query = connection.query({ sql, values: [1] });

        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans[0].name, 'SELECT');
          done();
        });
      });
    });
  });

  describe('enhancedDatabaseReporting:true config, should track mysql.values', () => {
    before(() => {
      instrumentation.disable();
      const config: MySQLInstrumentationConfig = {
        enhancedDatabaseReporting: true,
      };
      instrumentation.setConfig(config);
      instrumentation.enable();
    });

    after(() => {
      instrumentation.disable();
      instrumentation.setConfig({});
      instrumentation.enable();
    });

    it('call conn.query(sqlString) with no values', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const query = connection.query(
          'SELECT * FROM `books` WHERE `author` = "David"'
        );
        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            spans[0].attributes[AttributeNames.MYSQL_VALUES],
            ''
          );
          done();
        });
      });
    });
    it('call conn.query(sqlString, values)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT * FROM `books` WHERE `author` = ?';
        const query = connection.query(sql, ['David']);
        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            spans[0].attributes[AttributeNames.MYSQL_VALUES],
            '[David]'
          );
          done();
        });
      });
    });
    it('call conn.query(options)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql =
          'SELECT * FROM `books` WHERE `author` = ? AND `year` > ? OR `genre` = `?`';
        const query = connection.query({
          sql,
          values: ['David', 2000, 'Fiction'],
        });
        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            spans[0].attributes[AttributeNames.MYSQL_VALUES],
            '[David,2000,Fiction]'
          );
          done();
        });
      });
    });
    it('call conn.query(options, values)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT * FROM `books` WHERE `author` = ?';
        const query = connection.query({ sql }, ['David']);
        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            spans[0].attributes[AttributeNames.MYSQL_VALUES],
            '[David]'
          );
          done();
        });
      });
    });
  });

  describe('#Connection', () => {
    it('should intercept connection.query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = connection.query(sql);
        let rows = 0;

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        connection.query(sql, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept connection.query(text: options, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        connection.query({ sql, values: [1] }, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: options, values: [])', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        let rows = 0;
        const query = connection.query(sql, [1]);

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: options, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        connection.query({ sql }, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, value: any, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, 1, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should attach error messages to spans', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, (err, res) => {
          assert.ok(err);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, err!.message);
          done();
        });
      });
    });

    describe('active span context', () => {
      afterEach(() => {
        sinon.restore();
      });

      function assertParent(parentContext: Context) {
        const anyConn = connection as any;
        const originalImplyConnect = anyConn._implyConnect.bind(connection);
        return sinon.stub(anyConn, '_implyConnect').callsFake(() => {
          const activeSpan = trace.getSpan(
            context.active()
          ) as unknown as ReadableSpan;
          const parentSpanContext = trace.getSpanContext(parentContext);
          assert.strictEqual(
            activeSpan.spanContext().traceId,
            parentSpanContext?.traceId
          );
          assert.strictEqual(
            activeSpan.parentSpanContext?.spanId,
            parentSpanContext?.spanId
          );
          assert.notStrictEqual(
            activeSpan.spanContext().spanId,
            parentSpanContext?.spanId
          );
          originalImplyConnect();
        });
      }

      it('should have proper context active for connection.query(text: string)', done => {
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const parentContext = context.active();
          const stub = assertParent(parentContext);

          const query = connection.query('select 1');

          query.on('result', () => {
            assert.strictEqual(context.active(), parentContext);
          });

          query.on('end', () => {
            assert.strictEqual(context.active(), parentContext);
            sinon.assert.called(stub);
            done();
          });
        });
      });

      it('should have proper context active for connection.query(text: string, callback)', done => {
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const parentContext = context.active();
          const stub = assertParent(parentContext);

          connection.query('select 1', () => {
            sinon.assert.called(stub);
            assert.strictEqual(context.active(), parentContext);
            done();
          });
        });
      });
    });
  });

  describe('#Pool', () => {
    it('should intercept pool.query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = pool.query(sql);
        let rows = 0;

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept pool.getConnection().query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.getConnection((err, conn) => {
          const query = conn.query(sql);
          let rows = 0;

          query.on('result', row => {
            assert.strictEqual(row.solution, 2);
            rows += 1;
          });

          query.on('end', () => {
            assert.strictEqual(rows, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept pool.query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.query(sql, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept pool.getConnection().query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.getConnection((err, conn) => {
          conn.query(sql, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept pool.query(text: options, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        pool.query({ sql, values: [1] }, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: options, values: [])', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        let rows = 0;
        const query = pool.query(sql, [1]);

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: options, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        pool.query({ sql }, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: string, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: string, value: any, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, 1, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should attach error messages to spans', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, (err, res) => {
          assert.ok(err);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, err!.message);
          done();
        });
      });
    });

    it('should propagate active context to callback', done => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        pool.getConnection((err, connection) => {
          assert.ifError(err);
          assert.ok(connection);
          const sql = 'SELECT ? as solution';
          connection.query(sql, 1, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const actualSpan = trace.getSpan(context.active());
            assert.strictEqual(actualSpan, parentSpan);
            done();
          });
        });
      });
    });
  });

  describe('#PoolCluster', () => {
    it('should intercept poolClusterConnection.query(text: string)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+1 as solution';
          const query = poolClusterConnection.query(sql);
          let rows = 0;

          query.on('result', row => {
            assert.strictEqual(row.solution, 2);
            rows += 1;
          });

          query.on('end', () => {
            assert.strictEqual(rows, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: options, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+? as solution';
          poolClusterConnection.query({ sql, values: [1] }, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: options, values: [])', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+? as solution';
          const query = poolClusterConnection.query(sql, [1]);
          let rows = 0;

          query.on('result', row => {
            assert.strictEqual(row.solution, 2);
            rows += 1;
          });

          query.on('end', () => {
            assert.strictEqual(rows, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: options, values: [], callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+? as solution';
          poolClusterConnection.query({ sql }, [1], (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, values: [], callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, [1], (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, value: any, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, 1, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should attach error messages to spans', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ok(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, undefined, err!.message);
            done();
          });
        });
      });
    });

    it('should get connection by name', done => {
      poolCluster.getConnection('name', (err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const sql = 'SELECT 1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should get connection by name and selector', done => {
      poolCluster.getConnection(
        'name',
        'ORDER',
        (err, poolClusterConnection) => {
          assert.ifError(err);
          const sql = 'SELECT 1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        }
      );
    });

    it('should propagate active context to callback', done => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        poolCluster.getConnection((err, connection) => {
          assert.ifError(err);
          assert.ok(connection);
          const sql = 'SELECT ? as solution';
          connection.query(sql, 1, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const actualSpan = trace.getSpan(context.active());
            assert.strictEqual(actualSpan, parentSpan);
            done();
          });
        });
      });
    });
  });
});

function assertSpan(
  span: ReadableSpan,
  sql: string,
  values?: any,
  errorMessage?: string
) {
  assert.strictEqual(span.attributes[SEMATTRS_DB_SYSTEM], DBSYSTEMVALUES_MYSQL);
  assert.strictEqual(span.attributes[SEMATTRS_DB_NAME], database);
  assert.strictEqual(span.attributes[SEMATTRS_NET_PEER_PORT], port);
  assert.strictEqual(span.attributes[SEMATTRS_NET_PEER_NAME], host);
  assert.strictEqual(span.attributes[SEMATTRS_DB_USER], user);
  assert.strictEqual(span.attributes[SEMATTRS_DB_STATEMENT], sql);
  if (errorMessage) {
    assert.strictEqual(span.status.message, errorMessage);
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  }
}
