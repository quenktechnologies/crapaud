"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTestSuiteConf = exports.validateTestConf = void 0;
const preconditions_1 = require("@quenk/preconditions");
const string_1 = require("@quenk/preconditions/lib/string");
const boolean_1 = require("@quenk/preconditions/lib/boolean");
const function_1 = require("@quenk/preconditions/lib/function");
const record_1 = require("@quenk/preconditions/lib/record");
const array_1 = require("@quenk/preconditions/lib/array");
/**
 * validateTestConf validates a single object as a TestConf.
 */
exports.validateTestConf = preconditions_1.and(record_1.isRecord, record_1.intersect({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    before: preconditions_1.and(array_1.isArray, array_1.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    after: preconditions_1.and(array_1.isArray, array_1.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    transform: preconditions_1.optional(preconditions_1.or(string_1.isString, function_1.isFunction))
}));
/**
 * validateTestSuiteConf validates an entire test suite object.
 */
exports.validateTestSuiteConf = preconditions_1.and(record_1.isRecord, record_1.restrict({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    before: preconditions_1.and(array_1.isArray, array_1.map(string_1.isString)),
    beforeEach: preconditions_1.and(array_1.isArray, array_1.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    after: preconditions_1.and(array_1.isArray, array_1.map(string_1.isString)),
    afterEach: preconditions_1.and(array_1.isArray, array_1.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    transform: preconditions_1.optional(preconditions_1.or(string_1.isString, function_1.isFunction)),
    tests: preconditions_1.and(array_1.isArray, array_1.map(exports.validateTestConf)),
    include: preconditions_1.and(array_1.isArray, array_1.map(string_1.isString))
}));
//# sourceMappingURL=validate.js.map