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
const preconditions_1 = require("@quenk/preconditions");
const string_1 = require("@quenk/preconditions/lib/string");
const boolean_1 = require("@quenk/preconditions/lib/boolean");
const record_1 = require("@quenk/preconditions/lib/record");
const array_1 = require("@quenk/preconditions/lib/array");
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
/**
 * readJSONFile reads the contents of a file as JSON.
 */
const readJSONFile = (path) => future_1.doFuture(function* () {
    let txt = yield file_1.readTextFile(path);
    return future_1.attempt(() => JSON.parse(txt));
});
/**
 * resolve a relative string path to the current working directory.
 */
const resolve = (str) => path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);
/**
 * resolveAll resolves each path in the list provided.
 */
const resolveAll = (list) => list.map(resolve);
const executeScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeScript(script, ...args));
    return checkResult(result);
});
const executeAsyncScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeAsyncScript(script, ...args));
    return checkResult(result);
});
const checkResult = (result) => ((result != null) && (result.type === 'error')) ?
    future_1.raise(new Error(`Test failed: ${result.message} `)) :
    future_1.pure(result);
const execScripts = (scripts = [], args = []) => future_1.sequential(scripts.map(target => future_1.fromCallback(cb => {
    child_process_1.execFile(resolve(target), args, (err, stdout, stderr) => {
        if (stdout)
            console.log(stdout);
        if (stderr)
            console.error(stderr);
        cb(err);
    });
})));
/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf) => future_1.doFuture(function* () {
    let driver = yield getDriver(conf.browser);
    yield future_1.liftP(() => driver.get(conf.url));
    if (conf.injectMocha) {
        let js = yield file_1.readTextFile(FILE_MOCHA_JS);
        yield executeScript(driver, js);
    }
    yield executeAsyncScript(driver, SCRIPT_SETUP);
    yield execScripts(resolveAll(conf.before), [conf.path]);
    let script = yield file_1.readTextFile(resolve(conf.path));
    yield executeScript(driver, script);
    let result = yield executeAsyncScript(driver, SCRIPT_RUN);
    if (type_1.isObject(result)) {
        if (result.type === 'error') {
            yield onError(conf, new Error(result.message));
        }
        else {
            yield onSuccess(result);
        }
    }
    return onFinish(driver, conf);
});
const getDriver = (browser) => future_1.liftP(() => new selenium_webdriver_1.Builder()
    .forBrowser(browser)
    .build());
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
    if ((driver != null) && !(conf.keepOpen))
        yield future_1.liftP(() => driver.quit());
    yield execScripts(conf.after);
    return future_1.pure(undefined);
});
/**
 * runTestsFromFile given a path to a crapaud config file, will run the tests
 * declared within.
 */
const runTestsFromFile = (path) => future_1.doFuture(function* () {
    let obj = yield readJSONFile(resolve(path));
    let result = testSuiteConfCheck(obj);
    if (result.isLeft()) {
        let msgs = result.takeLeft().explain(errorTemplates);
        return future_1.raise(new Error(JSON.stringify(msgs)));
    }
    else {
        let conf = result.takeRight();
        return future_1.sequential(conf.tests.map(t => runTest(t)));
    }
});
/**
 * testConfCheck validates a single object as a TestConf.
 */
const testConfCheck = preconditions_1.and(record_1.isRecord, record_1.restrict({
    path: string_1.isString,
    browser: string_1.isString,
    url: string_1.isString,
    injectMocha: boolean_1.isBoolean,
    before: preconditions_1.and(array_1.isArray, array_1.map(string_1.isString))
}));
/**
 * testSuiteConfCheck validates an entire test suite object.
 */
const testSuiteConfCheck = preconditions_1.and(record_1.isRecord, record_1.restrict({
    tests: array_1.map(testConfCheck)
}));
const main = (options) => future_1.doFuture(function* () {
    return runTestsFromFile(options.path);
});
const BIN = path.basename(__filename);
const defaultCLIOptions = (args) => ({
    path: args['<path>']
});
const cliOptions = defaultCLIOptions(docopt.docopt(`
Usage:
   ${BIN} <path>

Thet path is a path to a crapaud.json file that tests will be executed from.

Options:
-h --help                  Show this screen.
--version                  Show the version of ${BIN}.
`, { version: require('../package.json').version }));
main(cliOptions).fork(console.error);
//# sourceMappingURL=main.js.map