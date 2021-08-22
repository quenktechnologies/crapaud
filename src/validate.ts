import { execFile as _execFile } from 'child_process';

import { Precondition, and, optional, or } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isFunction } from '@quenk/preconditions/lib/function';
import { isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';

import { ConfValue, TestSuiteConf, TestConf } from './conf';

/**
 * validateTestConf validates a single object as a TestConf.
 */
export const validateTestConf: Precondition<ConfValue, TestConf> =
    and(isRecord, restrict({

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
            arrayMap(isString)),

        beforeEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        after: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString)),

        afterEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        transform: <Precondition<ConfValue, ConfValue>>optional(
            or<ConfValue, ConfValue>(isString, isFunction)),

        tests: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(validateTestConf)),

        include: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString))

    }));
