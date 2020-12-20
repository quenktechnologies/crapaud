#! /usr/bin/env node

import * as path from 'path';
import * as os from 'os';
import * as docopt from 'docopt';
import * as json from '@quenk/noni/lib/data/json';

import { execFile } from 'child_process';
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
import { readTextFile } from '@quenk/noni/lib/io/file';
import { Value, Object } from '@quenk/noni/lib/data/json';
import { isObject } from '@quenk/noni/lib/data/type';

import { and, Precondition } from '@quenk/preconditions';
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
     * after is a list of script paths to execute after testing.
     */
    after: string[],

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

    browser: 'firefox',

    url: 'http://localhost:8080',

    injectMocha: true,

    before: [],

    after: [],

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
const resolve = (str: string) =>
    path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);

/**
 * resolveAll resolves each path in the list provided.
 */
const resolveAll = (list: string[]) => list.map(resolve);

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

const execScripts = (scripts: string[] = [], args: string[] = []) =>
    sequential(scripts.map(target => fromCallback(cb => {

        execFile(resolve(target), args, (err, stdout, stderr) => {

            if (stdout) console.log(stdout);

            if (stderr) console.error(stderr);

            cb(err);

        });

    })));

const runTestSuite = (conf: TestSuiteConf) => doFuture(function*() {

    yield execScripts(resolveAll(conf.before));

    yield sequential(conf.tests.map(t => runTest(inheritSuiteConf(conf, t))));

    yield execScripts(resolveAll(conf.after));

    return pure(undefined);

});

const inheritedProps = ['browser', 'url', 'injectMocha', 'keepOpen'];

const inheritSuiteConf = (conf: TestSuiteConf, test: TestConf) =>
    inheritedProps.reduce((test, prop) => {

        if (!test.hasOwnProperty(prop))
            test[prop] = conf[prop];

        return test;

    }, test);

/**
 * runTest executes a single test given a test configuration spec.
 */
const runTest = (conf: TestConf) => doFuture(function*() {

    let driver = yield getDriver(conf.browser);

    yield liftP(() => driver.get(conf.url));

    if (conf.injectMocha) {

        let js = yield readTextFile(FILE_MOCHA_JS);
        yield executeScript(driver, js);

    }

    yield executeAsyncScript(driver, SCRIPT_SETUP);

    yield execScripts(resolveAll(conf.before), [conf.path]);

    let script = yield readTextFile(resolve(conf.path));

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

    if ((driver != null) && !conf.keepOpen)
        yield liftP(() => driver.quit());

    yield execScripts(conf.after);

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
            arrayMap(isString))

    }));

/**
 * validateTestSuiteConf validates an entire test suite object.
 */
const validateTestSuiteConf: Precondition<json.Value, TestSuiteConf> =
    and(isRecord, restrict({

        browser: <Precondition<json.Value, json.Value>>isString,

        url: <Precondition<json.Value, json.Value>>isString,

        injectMocha: <Precondition<json.Value, json.Value>>isBoolean,

        before: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        after: <Precondition<json.Value, json.Value>>and(isArray,
            arrayMap(isString)),

        tests: <Precondition<json.Value, json.Value>>arrayMap(validateTestConf)

    }));

/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
const readTestSuiteFile = (path: string): Future<TestSuiteConf> =>
    doFuture(function*() {

        let result = yield readJSONFile(resolve(path));

        if (result.isLeft()) {

            let msg = result.takeLeft().message;

            let err = new Error(
                `Error encountered while reading "${path}": \n ${msg}`
            );

            return raise<TestSuiteConf>(err);

        }

        let obj = result.takeRight();

        if (!isObject(obj)) {

            let err = new Error(`Test file is at "${path}" is invalid!`);
            return raise<TestSuiteConf>(err);

        }

        let testResult = validateTestSuiteConf(merge(defaultTestSuite, obj));

        if (testResult.isLeft()) {

            let msgs = testResult.takeLeft().explain(errorTemplates);
            return raise<TestSuiteConf>(new Error(JSON.stringify(msgs)));

        }

        return pure(testResult.takeRight());

    });

const main = (options: CLIOptions) => doFuture(function*() {

    let conf = yield readTestSuiteFile(options.path);

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
