#! /usr/bin/env node

import * as path from 'path';
import * as os from 'os';
import * as docopt from 'docopt';
import * as stream from 'stream';
import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';
import { Builder, WebDriver } from 'selenium-webdriver';

import {
    Future,
    doFuture,
    fromCallback,
    sequential,
    liftP,
    pure,
    raise,
    attempt
} from '@quenk/noni/lib/control/monad/future';
import { isDirectory, readTextFile } from '@quenk/noni/lib/io/file';
import { Value, Object } from '@quenk/noni/lib/data/json';
import { isObject } from '@quenk/noni/lib/data/type';

import { Precondition, and, optional } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';
import { merge } from '@quenk/noni/lib/data/record';

type ScriptResult = json.Object | void;

/**
 * CLIOptions received from the terminal.
 */
interface CLIOptions {

    /**
     * path to the test suite config file.
     */
    path: string

}

/**
 * TestSuiteConf contains configuration info for a group of tests.
 */
interface TestSuiteConf extends json.Object {

    /**
     * path to the test suite config file.
     *
     * This is computed automatically.
     */
    path: string,

    /**
     * browser to run the tests in.
     */
    browser: string,

    /**
     * url the web browser will visit and inject tests in.
     */
    url: string,

    /**
     * injectMocha if true, will inject a mochajs script into the url's web 
     * page.
     */
    injectMocha: boolean,

    /**
     * before is a list of script paths to execute before testing.
     */
    before: string[],

    /**
     * beforeEach is a list of script paths to execute before each test.
     */
    beforeEach: string[],

    /**
     * after is a list of script paths to execute after testing.
     */
    after: string[],

    /**
     * afterEach is a list of script paths to execute after each test.
     */
    afterEach: string[],

    /**
     * transform for the test.
     */
    transform?: string,

    /**
     * keepOpen if true will attempt to leave the browser window open after 
     * a test completes.
     */
    keepOpen: boolean,

    /**
     * tests to execute in this suite.
     */
    tests: TestConf[]

}

/**
 * TestConf contains the configuration information needed to execute a single
 * test.
 */
interface TestConf extends json.Object {

    /*
     * path to the test file.
     */
    path: string,

    /**
     * browser to run the test in.
     */
    browser: string,

    /**
     * url to visit in the web browser.
     */
    url: string,

    /**
     * injectMocha if true, will inject a mochajs script into the url's web 
     * page.
     */
    injectMocha: boolean,

    /**
     * before is a list of script paths to execute before the test.
     */
    before: string[],

    /**
     * after is a list of script paths to execute after the test.
     */
    after: string[],

    /**
     * transform if specified, is a path to a script that each test will be
     * piped to before injection.
     */
    transform?: string,

    /**
     * keepOpen if true will attempt to leave the browser open after testing.
     */
    keepOpen: boolean,

}

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

const errorTemplates = {

}

const defaultTestSuite: TestSuiteConf = {

    path: process.cwd(),

    browser: 'firefox',

    url: 'http://localhost:8080',

    injectMocha: true,

    before: [],

    beforeEach: [],

    after: [],

    afterEach: [],

    keepOpen: false,

    tests: []

}

/**
 * readJSONFile reads the contents of a file as JSON.
 */
const readJSONFile = (path: string): Future<json.Object> =>
    doFuture(function*() {

        let txt = yield readTextFile(path);

        return attempt(() => JSON.parse(txt));

    })

/**
 * resolve a relative string path to the current working directory.
 */
const resolve = (str: string, cwd = process.cwd()) =>
    path.isAbsolute(str) ? str : path.resolve(cwd, str);

/**
 * resolveAll resolves each path in the list provided.
 */
const resolveAll = (list: string[], cwd = process.cwd()) =>
    list.map(p => resolve(p, cwd));

const executeScript = (driver: WebDriver, script: string, args: Value[] = []) =>
    doFuture(function*() {

        let result = yield liftP(() => driver.executeScript(script, ...args));
        return checkResult(result);

    });

const executeAsyncScript =
    (driver: WebDriver, script: string, args: Value[] = []) =>
        doFuture(function*() {

            let result = yield liftP(() =>
                driver.executeAsyncScript(script, ...args));

            return checkResult(result);

        });

const checkResult = (result: ScriptResult): Future<ScriptResult> =>
    ((result != null) && (result.type === 'error')) ?
        raise<ScriptResult>(new Error(`Test failed: ${result.message} `)) :
        pure<ScriptResult>(result);

const execFile = (path: string, args: string[] = []) => fromCallback(cb =>
    _execFile(path, args, (err, stdout, stderr) => {

        if (stdout) console.log(stdout);

        if (stderr) console.error(stderr);

        cb(err);

    }));

const execScripts = (scripts: string[] = [], args: string[] = []) =>
    sequential(scripts.map(target => execFile(target, args)));

const runTestSuite = (conf: TestSuiteConf) => doFuture(function*() {

    yield execScripts(resolveAll(conf.before, path.dirname(conf.path)));

    yield sequential(conf.tests.map(t =>
        runTest(expandTestPath(conf,
            inheritScripts(conf,
                inheritSuiteConf(conf, t))))
    ));

    yield execScripts(resolveAll(conf.after, path.dirname(conf.path)));

    return pure(undefined);

});

const inheritedProps = [
    'browser',
    'url',
    'injectMocha',
    'transform',
    'keepOpen'
];

const inheritSuiteConf = (conf: TestSuiteConf, test: TestConf) =>
    inheritedProps.reduce((test, prop) => {

        if (!test.hasOwnProperty(prop))
            test[prop] = conf[prop];

        return test;

    }, test);

const inheritScripts = (conf: TestSuiteConf, test: TestConf) => {

    test.before = conf.beforeEach.concat(test.before);
    test.after = conf.afterEach.concat(test.after);
    return test;

}

const expandTestPath = (conf: TestSuiteConf, test: TestConf) => {

    test.path = resolve(test.path, path.dirname(conf.path));
    return test;

}

/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf: TestConf) => doFuture(function*() {

    let driver = yield getDriver(conf.browser);

    let cwd = path.dirname(conf.path);

    yield liftP(() => driver.get(conf.url));

    if (conf.injectMocha) {

        let js = yield readTextFile(FILE_MOCHA_JS);

        yield executeScript(driver, js);

    }

    yield executeAsyncScript(driver, SCRIPT_SETUP);

    yield execScripts(resolveAll(conf.before, cwd), [conf.path]);

    let scriptPath = resolve(conf.path);

    let script = yield readTextFile(scriptPath);

    if (conf.transform)
        script = yield transformScript(
            resolve(conf.transform, path.dirname(scriptPath)),
            scriptPath,
            script
        );

    yield executeScript(driver, script);

    let result: json.Object = yield executeAsyncScript(driver, SCRIPT_RUN);

    if (isObject(result)) {

        if (result.type === 'error')
            yield onError(conf, new Error(<string>result.message));
        else
            yield onSuccess(result);

    }

    return onFinish(driver, conf);

});

const getDriver = (browser: string) => liftP(() =>
    new Builder()
        .forBrowser(browser)
        .build()
);

const transformScript = (cliPath: string, jsPath: string, jsTxt: string) =>
    fromCallback<string>(cb => {

        let proc = _execFile(cliPath, [jsPath], cb);
        let stdin = <stream.Writable>proc.stdin;
        stdin.write(jsTxt);
        stdin.end();

    });

const onError = (conf: TestConf, e: Error) => {

    console.error(`An error occured while executing test "${conf.path}"` +
        `against url "${conf.url}": ${os.EOL} ${e.message} `);

    return raise<void>(e);

}

const onSuccess = (result: ScriptResult) => {

    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d: Value) => console.log(...<Value[]>d));

    return pure(<void>undefined);

}

const onFinish = (driver: WebDriver, conf: TestConf) => doFuture(function*() {

    if (!conf.keepOpen)
        yield liftP(() => driver.quit());

    yield execScripts(resolveAll(conf.after, path.dirname(conf.path)));

    return pure(<void>undefined);

});

/**
 * validateTestConf validates a single object as a TestConf.
 */
const validateTestConf: Precondition<json.Value, TestConf> =
    and(isRecord, restrict({

        path: <Precondition<json.Value, json.Value>>isString,

        browser: <Precondition<json.Value, json.Value>>isString,

        url: <Precondition<json.Value, json.Value>>isString,

        injectMocha: <Precondition<json.Value, json.Value>>isBoolean,

        before: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        after: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        transform: <Precondition<json.Value, json.Value>>optional(isString)

    }));

/**
 * validateTestSuiteConf validates an entire test suite object.
 */
const validateTestSuiteConf: Precondition<json.Value, TestSuiteConf> =
    and(isRecord, restrict({

        path: <Precondition<json.Value, json.Value>>isString,

        browser: <Precondition<json.Value, json.Value>>isString,

        url: <Precondition<json.Value, json.Value>>isString,

        injectMocha: <Precondition<json.Value, json.Value>>isBoolean,

        before: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        beforeEach: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        after: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        afterEach: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        transform: <Precondition<json.Value, json.Value>>optional(isString),

        tests: <Precondition<json.Value, json.Value>>arrayMap(validateTestConf)

    }));

const expandTargets = ['beforeEach', 'afterEach', 'transform'];

const expandScriptPaths = (conf: TestSuiteConf, path: string) => {

    expandTargets.forEach(key => {

        let target = conf[key];

        if (!target) return;

        conf[key] = Array.isArray(target) ?
            target.map(str => resolve(<string>str, path)) :
            resolve(<string>target, path);

    });

    return conf;

}

/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
const readTestSuiteFile = (filePath: string): Future<TestSuiteConf> =>
    doFuture(function*() {

        let yes = yield isDirectory(filePath);

        if (yes) {

            filePath = path.join(filePath, 'crapaud.json');

        }

        let obj: json.Object = yield readJSONFile(filePath);

        if (!isObject(obj)) {

            let err = new Error(`Test file is at "${filePath}" is invalid!`);
            return raise<TestSuiteConf>(err);

        }

        obj.path = filePath;

        let suite = merge(defaultTestSuite, obj);

        suite.tests = suite.tests.map(t =>
            isObject(t) ? merge(defaultTestSuite, t) : t);

        let testResult = validateTestSuiteConf(suite);

        if (testResult.isLeft()) {

            let msgs = testResult.takeLeft().explain(errorTemplates);
            return raise<TestSuiteConf>(new Error(JSON.stringify(msgs)));

        }

        return pure(expandScriptPaths(testResult.takeRight(),
            path.dirname(filePath)));

    });

const main = (options: CLIOptions) => doFuture(function*() {

    let conf = yield readTestSuiteFile(resolve(options.path));

    yield runTestSuite(conf);

    return pure(<void>undefined);

});

const BIN = path.basename(__filename);

const defaultCLIOptions = (args: Object): CLIOptions => ({

    path: <string>args['<path>']

});

const cliOptions: CLIOptions = defaultCLIOptions(docopt.docopt(`
Usage:
  ${BIN} <path>

The path is a path to a crapaud.json file that tests will be executed from.

Options:
-h--help                  Show this screen.
--version                 Show the version of ${BIN}.
`, { version: require('../package.json').version }));

main(cliOptions).fork(console.error);
