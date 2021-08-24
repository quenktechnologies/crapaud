import * as path from 'path';

import { execFile as _execFile } from 'child_process';

import { isString as _isString } from '@quenk/noni/lib/data/type';

import { Precondition, and, optional, or } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isFunction } from '@quenk/preconditions/lib/function';
import { intersect, isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';
import { succeed } from '@quenk/preconditions/lib/result';

import { execFile, resolve } from './filesystem';
import { ConfValue, TestSuiteConf, TestConf, HookFunc } from './conf';

/**
 * validateTestConf validates a single object as a TestConf.
 */
export const validateTestConf: Precondition<ConfValue, TestConf> =
    and(isRecord, intersect({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        before: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        after: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        transform: <Precondition<ConfValue, ConfValue>>optional(
            or<ConfValue, ConfValue>(isString, isFunction))

    }));

const beforeScript2Func: Precondition<ConfValue, ConfValue> =
    (spec: ConfValue) => 
         succeed(_isString(spec) ? (conf: TestSuiteConf) =>
            execFile(resolve(<string>spec, path.dirname(conf.path))) :
            <HookFunc>spec);

/**
 * validateTestSuiteConf validates an entire test suite object.
 */
export const validateTestSuiteConf: Precondition<ConfValue, TestSuiteConf> =
    and(isRecord, restrict({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        before: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(and<ConfValue, ConfValue, ConfValue>(
                or<ConfValue, ConfValue>(isString, isFunction),
                beforeScript2Func
            ))),

        beforeEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        after: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(and<ConfValue, ConfValue, ConfValue>(
                or<ConfValue, ConfValue>(isString, isFunction),
                beforeScript2Func
            ))),

        afterEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        transform: <Precondition<ConfValue, ConfValue>>optional(
            or<ConfValue, ConfValue>(isString, isFunction)),

        tests: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(validateTestConf)),

        include: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString))

    }));
