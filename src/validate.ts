import * as path from 'path';

import {
    isString as _isString,
    isObject as _isObject,
    isFunction as _isFunction
} from '@quenk/noni/lib/data/type';

import { Precondition, and, optional, or } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isFunction } from '@quenk/preconditions/lib/function';
import { intersect, isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';
import { succeed } from '@quenk/preconditions/lib/result';

import { execFile, spawn, resolve } from './filesystem';
import { ConfValue, TestSuiteConf, TestConf, ScriptInfo } from './conf';

const validateScriptInfo: Precondition<ConfValue, ConfValue> =
    and(isRecord, intersect({

        path: <Precondition<ConfValue, ConfValue>>isString,

        background: <Precondition<ConfValue, ConfValue>>optional(isBoolean),

    }));

const scripts2Funcs: Precondition<ConfValue, ConfValue> =
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
        scripts2Funcs);

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

        transform: <Precondition<ConfValue, ConfValue>>optional(
            or<ConfValue, ConfValue>(isString, isFunction))

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

        transform: <Precondition<ConfValue, ConfValue>>optional(
            or<ConfValue, ConfValue>(isString, isFunction)),

        tests: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(validateTestConf)),

        include: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString))

    }));
