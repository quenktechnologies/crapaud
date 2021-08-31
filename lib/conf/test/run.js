"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandTestConf = exports.runTestSuite = exports.runTest = void 0;
const path = require("path");
const os = require("os");
const file_1 = require("@quenk/noni/lib/io/file");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const record_1 = require("@quenk/noni/lib/data/record");
const type_1 = require("@quenk/noni/lib/data/type");
const filesystem_1 = require("../../filesystem");
const driver_1 = require("../../driver");
const FILE_MOCHA_JS = path.resolve(__dirname, '../../../vendor/mocha/mocha.js');
const SCRIPT_RUN = `
    let cb = arguments[arguments.length - 1];

    mocha.run(failures => {

        cb({ type: 'result', data: window.testmeh.buffer, failures });

    });
`;
const defaultMochaOpts = { ui: 'bdd', color: true, reporter: 'spec' };
const setupScript = (conf = {}) => `

    window.testmeh = { log: console.log, buffer: [] };

    consoleStub = (type) => function() {
        testmeh.buffer.push(Array.prototype.slice.call(arguments));
        testmeh[type](...arguments);
    };

    // This allows us to capture console output.
    Mocha.reporters.Base.consoleLog = consoleStub('log');

    let cb = arguments[arguments.length - 1];

    try {

        mocha.setup(${JSON.stringify(conf)});
        cb();

    } catch (e) {

        cb({ type: 'error', message: e.message });

    }
`;
/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf) => future_1.doFuture(function* () {
    let driver = yield driver_1.getDriver(conf.browser);
    yield execScripts(conf, driver, conf.before, [conf.path]);
    yield future_1.liftP(() => driver.get(conf.url));
    if (conf.injectMocha) {
        let js = yield file_1.readTextFile(FILE_MOCHA_JS);
        yield driver_1.execDriverScript(driver, js);
    }
    let mochaConf = record_1.merge(defaultMochaOpts, conf.mochaOptions ?
        conf.mochaOptions : {});
    yield driver_1.execAsyncDriverScript(driver, setupScript(mochaConf));
    let scriptPath = filesystem_1.resolve(conf.path);
    let script = yield file_1.readTextFile(scriptPath);
    if (conf.transform)
        script = yield execTransformScripts(conf, conf.transform, scriptPath, script);
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
exports.runTest = runTest;
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
    yield execScripts(conf, driver, conf.after, [conf.path]);
    return future_1.pure(undefined);
});
const execTransformScripts = (conf, funcs, scriptPath, txt) => future_1.reduce(funcs, txt, (out, f) => f(conf, scriptPath, out));
const execScripts = (conf, driver, scripts, args = []) => future_1.sequential(scripts.map((script) => script.apply(null, [conf, driver, ...args])));
/**
 * runTestSuite runs all the tests within a suite.
 */
const runTestSuite = (conf) => future_1.doFuture(function* () {
    yield future_1.sequential(conf.before.map(f => f(conf)));
    yield future_1.sequential(conf.tests.map(exports.runTest));
    yield future_1.sequential(conf.after.map(f => f(conf)));
    return future_1.pure(undefined);
});
exports.runTestSuite = runTestSuite;
const defaultTestConf = { before: [], after: [] };
/**
 * expandTestConf given a TestSuiteConf and a TestConf will make the TestConf
 * inherit the relevant properties of the TestSuiteConf.
 */
const expandTestConf = (parent, conf) => expandTestPath(parent, inheritScripts(parent, inheritSuiteConf(parent, record_1.merge(defaultTestConf, conf))));
exports.expandTestConf = expandTestConf;
const inheritedProps = [
    'browser',
    'url',
    'injectMocha',
    'mochaOptions',
    'transform',
    'keepOpen'
];
const inheritSuiteConf = (conf, test) => inheritedProps.reduce((test, prop) => {
    if (!test.hasOwnProperty(prop))
        test[prop] = conf[prop];
    return test;
}, test);
const inheritScripts = (conf, test) => {
    test.before = conf.beforeEach
        .concat(test.before);
    test.after = conf.afterEach
        .concat(test.after);
    return test;
};
const expandTestPath = (conf, test) => {
    test.path = filesystem_1.resolve(test.path, path.dirname(conf.path));
    return test;
};
//# sourceMappingURL=run.js.map