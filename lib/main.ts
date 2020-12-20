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

/**
 * TestSuiteConf contains configuration info for a group of tests.
 */
interface TestSuiteConf extends json.Object {

    /**
     * tests to execute in this suite.
     */
    tests: TestConf[]

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

};

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

        if (result.type === 'error') {

            yield onError(conf, new Error(<string>result.message));

        } else {

            yield onSuccess(result);

        }

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

    if ((driver != null) && !(conf.keepOpen))
        yield liftP(() => driver.quit());

    yield execScripts(conf.after);

    return pure(<void>undefined);

});

/**
 * runTestsFromFile given a path to a crapaud config file, will run the tests
 * declared within.
 */
const runTestsFromFile = (path: string) => doFuture(function*() {

    let obj = yield readJSONFile(resolve(path));

    let result = testSuiteConfCheck(obj);

    if (result.isLeft()) {

        let msgs = result.takeLeft().explain(errorTemplates);
        return <Future<void[]>>raise(new Error(JSON.stringify(msgs)));

    } else {

        let conf = result.takeRight();
        return sequential(conf.tests.map(t => runTest(t)));

    }

});

/**
 * testConfCheck validates a single object as a TestConf.
 */
const testConfCheck: Precondition<json.Value, TestConf> =
    and(isRecord, restrict({

        path: <Precondition<json.Value, json.Value>>isString,

        browser: <Precondition<json.Value, json.Value>>isString,

        url: <Precondition<json.Value, json.Value>>isString,

        injectMocha: <Precondition<json.Value, json.Value>>isBoolean,

        before: <Precondition<json.Value, json.Value>>and(isArray, arrayMap(isString))

    }));

/**
 * testSuiteConfCheck validates an entire test suite object.
 */
const testSuiteConfCheck: Precondition<json.Value, TestSuiteConf> =
    and(isRecord, restrict({

        tests: <Precondition<json.Value, json.Value>>arrayMap(testConfCheck)

    }));

const main = (options: CLIOptions) => doFuture(function*() {

    return runTestsFromFile(options.path);

});

const BIN = path.basename(__filename);

const defaultCLIOptions = (args: Object): CLIOptions => ({

    path: <string>args['<path>']

});

const cliOptions: CLIOptions = defaultCLIOptions(docopt.docopt(`
Usage:
   ${BIN} <path>

Thet path is a path to a crapaud.json file that tests will be executed from.

Options:
-h --help                  Show this screen.
--version                  Show the version of ${BIN}.
`, { version: require('../package.json').version }));

main(cliOptions).fork(console.error);
