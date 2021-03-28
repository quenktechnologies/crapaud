#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const os = require("os");
const docopt = require("docopt");
const child_process_1 = require("child_process");
const selenium_webdriver_1 = require("selenium-webdriver");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
const type_1 = require("@quenk/noni/lib/data/type");
const record_1 = require("@quenk/noni/lib/data/record");
const array_1 = require("@quenk/noni/lib/data/array");
const preconditions_1 = require("@quenk/preconditions");
const string_1 = require("@quenk/preconditions/lib/string");
const boolean_1 = require("@quenk/preconditions/lib/boolean");
const function_1 = require("@quenk/preconditions/lib/function");
const record_2 = require("@quenk/preconditions/lib/record");
const array_2 = require("@quenk/preconditions/lib/array");
const FILE_MOCHA_JS = path.resolve(__dirname, '../vendor/mocha/mocha.js');
const SCRIPT_SETUP = `

    window.testmeh = { log: console.log, buffer: [] };

    consoleStub = (type) => function() {
        testmeh.buffer.push(Array.prototype.slice.call(arguments));
        testmeh[type](...arguments);
    };

    // This allows us to capture console output.
    Mocha.reporters.Base.consoleLog = consoleStub('log');

    let cb = arguments[arguments.length - 1];

    try {

        mocha.setup({ ui: 'bdd', color: true, reporter: 'spec' });
        cb();

    } catch (e) {

        cb({ type: 'error', message: e.message });

    }

`;
const SCRIPT_RUN = `
    let cb = arguments[arguments.length - 1];

    mocha.run(failures => {

        cb({ type: 'result', data: window.testmeh.buffer, failures });

    });
`;
const errorTemplates = {};
const defaultTestSuite = {
    path: process.cwd(),
    browser: 'firefox',
    url: 'http://localhost:8080',
    injectMocha: true,
    before: [],
    beforeEach: [],
    after: [],
    afterEach: [],
    keepOpen: false,
    tests: [],
    include: []
};
/**
 * readJSONFile reads the contents of a file as JSON.
 */
const readJSONFile = (path) => future_1.doFuture(function* () {
    let txt = yield file_1.readTextFile(path);
    return future_1.attempt(() => JSON.parse(txt));
});
/**
 * readFile reads the contents of a js file.
 */
const readJSFile = (path) => future_1.attempt(() => require(path));
/**
 * resolve a relative string path to the current working directory.
 */
const resolve = (str, cwd = process.cwd()) => path.isAbsolute(str) ? str : path.resolve(cwd, str);
/**
 * resolveAll resolves each path in the list provided.
 */
const resolveAll = (list, cwd = process.cwd()) => list.map(p => resolve(p, cwd));
const execDriverScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeScript(script, ...args));
    return checkResult(result);
});
const execAsyncDriverScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeAsyncScript(script, ...args));
    return checkResult(result);
});
const checkResult = (result) => ((result != null) && (result.type === 'error')) ?
    future_1.raise(new Error(`Test failed: ${result.message} `)) :
    future_1.pure(result);
const execFile = (path, args = []) => future_1.fromCallback(cb => child_process_1.execFile(path, args, (err, stdout, stderr) => {
    if (stdout)
        console.log(stdout);
    if (stderr)
        console.error(stderr);
    cb(err);
}));
const execCLIScripts = (scripts = [], args = []) => future_1.sequential(scripts.map(target => execFile(target, args)));
const execBeforeScripts = (driver, conf, args = []) => execSpecScripts(driver, conf, conf.before, args);
const execAfterScripts = (driver, conf, args = []) => execSpecScripts(driver, conf, conf.after, args);
const execSpecScripts = (driver, conf, scripts, args = []) => future_1.sequential(scripts.map(script => type_1.isString(script) ?
    execFile(resolve(script, path.dirname(conf.path)), args) :
    script(driver, conf)));
const runTestSuite = (conf) => future_1.doFuture(function* () {
    yield execCLIScripts(resolveAll(conf.before, path.dirname(conf.path)));
    yield future_1.sequential(conf.tests.map(t => runTest(expandTestPath(conf, inheritScripts(conf, inheritSuiteConf(conf, t))))));
    yield execCLIScripts(resolveAll(conf.after, path.dirname(conf.path)));
    return future_1.pure(undefined);
});
const inheritedProps = [
    'browser',
    'url',
    'injectMocha',
    'transform',
    'keepOpen'
];
const inheritSuiteConf = (conf, test) => inheritedProps.reduce((test, prop) => {
    if (!test.hasOwnProperty(prop))
        test[prop] = conf[prop];
    return test;
}, test);
const inheritScripts = (conf, test) => {
    test.before = conf.beforeEach.concat(test.before);
    test.after = conf.afterEach.concat(test.after);
    return test;
};
const expandTestPath = (conf, test) => {
    test.path = resolve(test.path, path.dirname(conf.path));
    return test;
};
/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf) => future_1.doFuture(function* () {
    let driver = yield getDriver(conf.browser);
    yield execBeforeScripts(driver, conf, [conf.path]);
    yield future_1.liftP(() => driver.get(conf.url));
    if (conf.injectMocha) {
        let js = yield file_1.readTextFile(FILE_MOCHA_JS);
        yield execDriverScript(driver, js);
    }
    yield execAsyncDriverScript(driver, SCRIPT_SETUP);
    let scriptPath = resolve(conf.path);
    let script = yield file_1.readTextFile(scriptPath);
    if (conf.transform)
        script = yield execTransformScript(conf, conf.transform, script);
    yield execDriverScript(driver, script);
    let result = yield execAsyncDriverScript(driver, SCRIPT_RUN);
    if (type_1.isObject(result)) {
        if (result.type === 'error')
            yield onError(conf, new Error(result.message));
        else
            yield onSuccess(result);
    }
    return onFinish(driver, conf);
});
const getDriver = (browser) => future_1.liftP(() => new selenium_webdriver_1.Builder()
    .forBrowser(browser)
    .build());
const execTransformScript = (conf, trans, src) => type_1.isString(trans) ?
    future_1.fromCallback(cb => {
        let cliPath = resolve(trans, path.dirname(conf.path));
        let proc = child_process_1.execFile(cliPath, [conf.path], cb);
        let stdin = proc.stdin;
        stdin.write(src);
        stdin.end();
    }) :
    trans(conf, src);
const onError = (conf, e) => {
    console.error(`An error occured while executing test "${conf.path}"` +
        `against url "${conf.url}": ${os.EOL} ${e.message} `);
    return future_1.raise(e);
};
const onSuccess = (result) => {
    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d) => console.log(...d));
    return future_1.pure(undefined);
};
const onFinish = (driver, conf) => future_1.doFuture(function* () {
    if (!conf.keepOpen)
        yield future_1.liftP(() => driver.quit());
    yield execAfterScripts(driver, conf, [conf.path]);
    return future_1.pure(undefined);
});
/**
 * validateTestConf validates a single object as a TestConf.
 */
const validateTestConf = preconditions_1.and(record_2.isRecord, record_2.restrict({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    before: preconditions_1.and(array_2.isArray, array_2.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    after: preconditions_1.and(array_2.isArray, array_2.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    transform: preconditions_1.optional(preconditions_1.or(string_1.isString, function_1.isFunction))
}));
/**
 * validateTestSuiteConf validates an entire test suite object.
 */
const validateTestSuiteConf = preconditions_1.and(record_2.isRecord, record_2.restrict({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    before: preconditions_1.and(array_2.isArray, array_2.map(string_1.isString)),
    beforeEach: preconditions_1.and(array_2.isArray, array_2.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    after: preconditions_1.and(array_2.isArray, array_2.map(string_1.isString)),
    afterEach: preconditions_1.and(array_2.isArray, array_2.map(preconditions_1.or(string_1.isString, function_1.isFunction))),
    transform: preconditions_1.optional(preconditions_1.or(string_1.isString, function_1.isFunction)),
    tests: preconditions_1.and(array_2.isArray, array_2.map(validateTestConf)),
    include: preconditions_1.and(array_2.isArray, array_2.map(string_1.isString))
}));
const expandTargets = ['beforeEach', 'afterEach', 'transform'];
const expandScriptPaths = (conf, path) => {
    expandTargets.forEach(key => {
        let target = conf[key];
        if (!target)
            return;
        conf[key] = Array.isArray(target) ?
            target.map(spec => type_1.isString(spec) ? resolve(spec, path) : spec) :
            resolve(target, path);
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
    let yes = yield file_1.isDirectory(filePath);
    if (yes) {
        let jsFilePath = path.join(filePath, 'crapaud.js');
        filePath = (yield file_1.isFile(jsFilePath)) ?
            jsFilePath :
            path.join(filePath, 'crapaud.json');
    }
    let obj = filePath.endsWith('.js') ?
        yield readJSFile(filePath) :
        yield readJSONFile(filePath);
    if (!type_1.isObject(obj)) {
        let err = new Error(`Test file at "${filePath}" is invalid!`);
        return future_1.raise(err);
    }
    obj.path = filePath;
    let suite = record_1.merge(defaultTestSuite, obj);
    suite.tests = suite.tests.map(t => type_1.isObject(t) ? record_1.merge(defaultTestSuite, t) : t);
    let testResult = validateTestSuiteConf(suite);
    if (testResult.isLeft()) {
        let msgs = testResult.takeLeft().explain(errorTemplates);
        return future_1.raise(new Error(JSON.stringify(msgs)));
    }
    return future_1.pure(expandScriptPaths(testResult.takeRight(), path.dirname(filePath)));
});
/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
const readTestSuiteFileDeep = (filePath) => future_1.doFuture(function* () {
    let conf = yield readTestSuiteFile(filePath);
    let work = conf.include.map((i) => readTestSuiteFileDeep(resolve(i, path.dirname(filePath))));
    let results = yield future_1.batch(array_1.distribute(work, 50));
    return future_1.pure([conf, ...array_1.flatten(results)]);
});
const main = (options) => future_1.doFuture(function* () {
    let confs = yield readTestSuiteFileDeep(resolve(options.path));
    yield future_1.sequential(confs.map(conf => runTestSuite(conf)));
    return future_1.pure(undefined);
});
const BIN = path.basename(__filename);
const defaultCLIOptions = (args) => ({
    path: args['<path>']
});
const cliOptions = defaultCLIOptions(docopt.docopt(`
Usage:
  ${BIN} <path>

The path is a path to a crapaud.json file that tests will be executed from.

Options:
-h--help                  Show this screen.
--version                 Show the version of ${BIN}.
`, { version: require('../package.json').version }));
main(cliOptions).fork(console.error);
//# sourceMappingURL=main.js.map