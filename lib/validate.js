"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTestSuiteConf = exports.validateTestConf = void 0;
const path = require("path");
const type_1 = require("@quenk/noni/lib/data/type");
const preconditions_1 = require("@quenk/preconditions");
const string_1 = require("@quenk/preconditions/lib/string");
const boolean_1 = require("@quenk/preconditions/lib/boolean");
const function_1 = require("@quenk/preconditions/lib/function");
const record_1 = require("@quenk/preconditions/lib/record");
const array_1 = require("@quenk/preconditions/lib/array");
const result_1 = require("@quenk/preconditions/lib/result");
const filesystem_1 = require("./filesystem");
const validateScriptInfo = preconditions_1.and(record_1.isRecord, record_1.intersect({
    path: string_1.isString,
    background: preconditions_1.optional(boolean_1.isBoolean),
}));
const scripts2Funcs = (spec) => {
    let scripts = Array.isArray(spec) ? spec : [spec];
    return result_1.succeed(scripts.map(script => {
        if (type_1.isFunction(script)) {
            return script;
        }
        else if (type_1.isString(script)) {
            return (conf) => filesystem_1.execFile(filesystem_1.resolve(script, path.dirname(conf.path)));
        }
        else if (type_1.isObject(script)) {
            let { path: scriptPath, background } = script;
            return (conf) => {
                scriptPath = filesystem_1.resolve(scriptPath, conf.path);
                return background ? filesystem_1.spawn(scriptPath) : filesystem_1.execFile(scriptPath);
            };
        }
    }));
};
const validateScriptSpec = preconditions_1.or(string_1.isString, preconditions_1.or(function_1.isFunction, preconditions_1.and(record_1.isRecord, validateScriptInfo)));
const validateScriptSpecProp = preconditions_1.and(preconditions_1.or(preconditions_1.and(array_1.isArray, array_1.map(validateScriptSpec)), validateScriptSpec), scripts2Funcs);
/**
 * validateTestConf validates a single object as a TestConf.
 */
exports.validateTestConf = preconditions_1.and(record_1.isRecord, record_1.intersect({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    mochaOptions: preconditions_1.optional(record_1.isRecord),
    before: validateScriptSpecProp,
    after: validateScriptSpecProp,
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
    mochaOptions: preconditions_1.optional(record_1.isRecord),
    before: validateScriptSpecProp,
    beforeEach: validateScriptSpecProp,
    after: validateScriptSpecProp,
    afterEach: validateScriptSpecProp,
    transform: preconditions_1.optional(preconditions_1.or(string_1.isString, function_1.isFunction)),
    tests: preconditions_1.and(array_1.isArray, array_1.map(exports.validateTestConf)),
    include: preconditions_1.and(array_1.isArray, array_1.map(string_1.isString))
}));
//# sourceMappingURL=validate.js.map