"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTestSuiteFileDeep = exports.readTestSuiteFile = void 0;
const path = require("path");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
const type_1 = require("@quenk/noni/lib/data/type");
const record_1 = require("@quenk/noni/lib/data/record");
const array_1 = require("@quenk/noni/lib/data/array");
const test_1 = require("./conf/test");
const filesystem_1 = require("./filesystem");
const validate_1 = require("./validate");
const errorTemplates = {};
const defaultTestSuite = {
    path: process.cwd(),
    browser: 'firefox',
    url: 'http://localhost:8080',
    injectMocha: true,
    mochaOptions: {},
    before: [],
    beforeEach: [],
    after: [],
    afterEach: [],
    keepOpen: false,
    tests: [],
    include: []
};
const expandTargets = ['beforeEach', 'afterEach', 'transform'];
const expandScriptPaths = (conf, path) => {
    expandTargets.forEach(key => {
        let target = conf[key];
        if (!target)
            return;
        conf[key] = Array.isArray(target) ?
            target.map(spec => type_1.isString(spec) ? filesystem_1.resolve(spec, path) : spec) :
            type_1.isString(target) ? filesystem_1.resolve(target, path) : target;
    });
    return conf;
};
/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
const readTestSuiteFile = (filePath) => future_1.doFuture(function* () {
    if (yield file_1.isDirectory(filePath)) {
        let jsFilePath = path.join(filePath, 'crapaud.js');
        filePath = (yield file_1.isFile(jsFilePath)) ?
            jsFilePath :
            path.join(filePath, 'crapaud.json');
    }
    let obj = filePath.endsWith('.js') ?
        yield filesystem_1.readJSFile(filePath) :
        yield filesystem_1.readJSONFile(filePath);
    if (!type_1.isObject(obj)) {
        let err = new Error(`Test file at "${filePath}" is invalid!`);
        return future_1.raise(err);
    }
    obj.path = filePath;
    let suite = record_1.merge(defaultTestSuite, obj);
    let testResult = validate_1.validateTestSuiteConf(suite);
    if (testResult.isLeft()) {
        let msgs = testResult.takeLeft().explain(errorTemplates);
        return future_1.raise(new Error(JSON.stringify(msgs)));
    }
    let validSuite = expandScriptPaths(testResult.takeRight(), path.dirname(filePath));
    validSuite.tests = validSuite.tests.map(test => test_1.expandTestConf(validSuite, test));
    return future_1.pure(validSuite);
});
exports.readTestSuiteFile = readTestSuiteFile;
/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
const readTestSuiteFileDeep = (filePath) => future_1.doFuture(function* () {
    let conf = yield exports.readTestSuiteFile(filePath);
    let work = conf.include.map((i) => exports.readTestSuiteFileDeep(filesystem_1.resolve(i, path.dirname(filePath))));
    let results = yield future_1.batch(array_1.distribute(work, 50));
    return future_1.pure([conf, ...array_1.flatten(results)]);
});
exports.readTestSuiteFileDeep = readTestSuiteFileDeep;
//# sourceMappingURL=cli.js.map