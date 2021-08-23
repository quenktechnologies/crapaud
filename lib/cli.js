"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTestSuite = exports.readTestSuiteFileDeep = exports.readTestSuiteFile = void 0;
const path = require("path");
const os = require("os");
const child_process_1 = require("child_process");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
const type_1 = require("@quenk/noni/lib/data/type");
const record_1 = require("@quenk/noni/lib/data/record");
const array_1 = require("@quenk/noni/lib/data/array");
const filesystem_1 = require("./filesystem");
const validate_1 = require("./validate");
const driver_1 = require("./driver");
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
const defaultTestConf = {
    before: [],
    after: []
};
const execCLIScripts = (scripts = [], args = []) => future_1.sequential(scripts.map(target => filesystem_1.execFile(target, args)));
const execBeforeScripts = (driver, conf, args = []) => execSpecScripts(driver, conf, conf.before, args);
const execAfterScripts = (driver, conf, args = []) => execSpecScripts(driver, conf, conf.after, args);
const execSpecScripts = (driver, conf, scripts, args = []) => future_1.sequential(scripts.map(script => type_1.isString(script) ?
    filesystem_1.execFile(filesystem_1.resolve(script, path.dirname(conf.path)), args) :
    script(driver, conf)));
const expandTestConf = (parent, conf) => expandTestPath(parent, inheritScripts(parent, inheritSuiteConf(parent, record_1.merge(defaultTestConf, conf))));
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
    test.path = filesystem_1.resolve(test.path, path.dirname(conf.path));
    return test;
};
const execTransformScript = (conf, trans, scriptPath, txt) => type_1.isString(trans) ?
    future_1.fromCallback(cb => {
        let cliPath = filesystem_1.resolve(trans, path.dirname(conf.path));
        let proc = child_process_1.execFile(cliPath, [conf.path], cb);
        let stdin = proc.stdin;
        stdin.write(txt);
        stdin.end();
    }) :
    trans(conf, scriptPath, txt);
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
    validSuite.tests = validSuite.tests.map(test => expandTestConf(validSuite, test));
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
/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf) => future_1.doFuture(function* () {
    let driver = yield driver_1.getDriver(conf.browser);
    yield execBeforeScripts(driver, conf, [conf.path]);
    yield future_1.liftP(() => driver.get(conf.url));
    if (conf.injectMocha) {
        let js = yield file_1.readTextFile(FILE_MOCHA_JS);
        yield driver_1.execDriverScript(driver, js);
    }
    yield driver_1.execAsyncDriverScript(driver, SCRIPT_SETUP);
    let scriptPath = filesystem_1.resolve(conf.path);
    let script = yield file_1.readTextFile(scriptPath);
    if (conf.transform)
        script = yield execTransformScript(conf, conf.transform, scriptPath, script);
    yield driver_1.execDriverScript(driver, script);
    let result = yield driver_1.execAsyncDriverScript(driver, SCRIPT_RUN);
    if (type_1.isObject(result)) {
        if (result.type === 'error')
            yield onError(conf, new Error(result.message));
        else
            yield onSuccess(result);
    }
    return onFinish(driver, conf);
});
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
 * runTestSuite runs all the tests within a suite.
 */
const runTestSuite = (conf) => future_1.doFuture(function* () {
    yield execCLIScripts(filesystem_1.resolveAll(conf.before, path.dirname(conf.path)));
    yield future_1.sequential(conf.tests.map(runTest));
    yield execCLIScripts(filesystem_1.resolveAll(conf.after, path.dirname(conf.path)));
    return future_1.pure(undefined);
});
exports.runTestSuite = runTestSuite;
//# sourceMappingURL=cli.js.map