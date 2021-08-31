import * as path from 'path';
import * as stream from 'stream';
import * as cp from 'child_process';

import { fromCallback } from '@quenk/noni/lib/control/monad/future';
import {
    isString as _isString,
    isObject as _isObject,
    isFunction as _isFunction
} from '@quenk/noni/lib/data/type';
import { Path } from '@quenk/noni/lib/io/file';

import { Precondition, and, optional, or } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isFunction } from '@quenk/preconditions/lib/function';
import { intersect, isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';
import { succeed } from '@quenk/preconditions/lib/result';

import { TestSuiteConf } from './conf/test/suite';
import { ConfValue, TestConf, ScriptInfo } from './conf/test';
import { execFile, spawn, resolve } from './filesystem';

const validateScriptInfo: Precondition<ConfValue, ConfValue> =
    and(isRecord, intersect({

        path: <Precondition<ConfValue, ConfValue>>isString,

        background: <Precondition<ConfValue, ConfValue>>optional(isBoolean),

    }));

const beforeAfter2Funcs: Precondition<ConfValue, ConfValue> =
    (spec: ConfValue) => {

        let scripts = Array.isArray(spec) ? spec : [spec];

        return succeed(scripts.map(script => {

            if (_isFunction(script)) {

                return script;

            } else if (_isString(script)) {

                return (conf: TestSuiteConf) =>
                    execFile(resolve(script, path.dirname(conf.path)));

            } else if (_isObject(script)) {

                let { path: scriptPath, background } = <ScriptInfo>script;

                return (conf: TestSuiteConf) => {

                    scriptPath = resolve(scriptPath, conf.path);

                    return background ? spawn(scriptPath) : execFile(scriptPath);

                }

            }

        }));

    }

const validateScriptSpec =
    or(isString, or(isFunction, and(isRecord, validateScriptInfo)));

const validateScriptSpecProp: Precondition<ConfValue, ConfValue> =
    and(or(and(isArray, arrayMap(validateScriptSpec)), validateScriptSpec),
        beforeAfter2Funcs);

const transform2Funcs: Precondition<ConfValue, ConfValue> =
    (spec: ConfValue) => {

        let scripts = Array.isArray(spec) ? spec : [spec];

        return succeed(scripts.map(script => {

            if (_isFunction(script)) {

                return script;

            } else if (_isString(script)) {

                return (conf: TestConf, txtPath: Path, txt: string) =>
                    fromCallback<string>(cb => {

                        let cliPath = resolve(script, path.dirname(conf.path));
                        let proc = cp.execFile(cliPath, [conf.path,txtPath], cb);
                        let stdin = <stream.Writable>proc.stdin;

                        stdin.write(txt);
                        stdin.end();

                    });

            }

        }));

    }

const validateTransformSpec = or<ConfValue, ConfValue>(isString, isFunction);

const validateTransformSpecProp: Precondition<ConfValue, ConfValue> =
    and(or(and(isArray, arrayMap(validateTransformSpec)),
        validateTransformSpec), transform2Funcs);

/**
 * validateTestConf validates a single object as a TestConf.
 */
export const validateTestConf: Precondition<ConfValue, TestConf> =
    and(isRecord, intersect({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        mochaOptions: <Precondition<ConfValue, ConfValue>>optional(isRecord),

        before: validateScriptSpecProp,

        after: validateScriptSpecProp,

        transform: optional(validateTransformSpecProp),

    }));

/**
 * validateTestSuiteConf validates an entire test suite object.
 */
export const validateTestSuiteConf: Precondition<ConfValue, TestSuiteConf> =
    and(isRecord, restrict({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        mochaOptions: <Precondition<ConfValue, ConfValue>>optional(isRecord),

        before: validateScriptSpecProp,

        beforeEach: validateScriptSpecProp,

        after: validateScriptSpecProp,

        afterEach: validateScriptSpecProp,

        transform: optional(validateTransformSpecProp),

        tests: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(validateTestConf)),

        include: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString))

    }));
