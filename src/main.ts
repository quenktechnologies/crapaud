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
    attempt,
    batch
} from '@quenk/noni/lib/control/monad/future';
import { isDirectory, isFile, Path, readTextFile } from '@quenk/noni/lib/io/file';
import { Value, Object } from '@quenk/noni/lib/data/json';
import { isObject, isString as isStringType } from '@quenk/noni/lib/data/type';
import { merge } from '@quenk/noni/lib/data/record';
import { distribute, flatten } from '@quenk/noni/lib/data/array';

import { Precondition, and, optional, or } from '@quenk/preconditions';
import { isString } from '@quenk/preconditions/lib/string';
import { isBoolean } from '@quenk/preconditions/lib/boolean';
import { isFunction } from '@quenk/preconditions/lib/function';
import { isRecord, restrict } from '@quenk/preconditions/lib/record';
import { isArray, map as arrayMap } from '@quenk/preconditions/lib/array';

type ScriptResult = json.Object | void;

type ScriptFunc = (driver: WebDriver, conf: TestConf) => Future<void>

type ScriptSpec
    = Path
    | ScriptFunc
    ;

type TransformScript = (conf: TestConf, src: string) => Future<string>

type TransformSpec
    = Path
    | TransformScript
    ;

type ConfValue
    = json.Value
    | Function
    | ConfObject
    | ConfValue[]
    ;

/**
 * CLIOptions received from the terminal.
 */
interface CLIOptions {

    /**
     * path to the test suite config file.
     */
    path: Path

}

/**
 * ConfObject is the parent interface of the suite and test conf objects.
 *
 * This is a mix of a json object that can also contain functions.
 */
interface ConfObject {

    [key: string]: ConfValue

}

/**
 * TestSuiteConf contains configuration info for a group of tests.
 */
interface TestSuiteConf extends ConfObject {

    /**
     * path to the test suite config file.
     *
     * This is computed automatically.
     */
    path: Path,

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
    before: Path[],

    /**
     * beforeEach is a list of script paths to execute before each test.
     */
    beforeEach: ScriptSpec[],

    /**
     * after is a list of script paths to execute after testing.
     */
    after: Path[],

    /**
     * afterEach is a list of script paths to execute after each test.
     */
    afterEach: ScriptSpec[],

    /**
     * transform for the test.
     */
    transform?: TransformSpec,

    /**
     * keepOpen if true will attempt to leave the browser window open after 
     * a test completes.
     */
    keepOpen: boolean,

    /**
     * tests to execute in this suite.
     */
    tests: TestConf[],

    /**
     * include is a list of other TestSuiteConfs to execute after this one.
     */
    include: Path[]

}

/**
 * TestConf contains the configuration information needed to execute a single
 * test.
 */
interface TestConf extends ConfObject {

    /*
     * path to the test file.
     */
    path: Path,

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
    before: ScriptSpec[],

    /**
     * after is a list of script paths to execute after the test.
     */
    after: ScriptSpec[],

    /**
     * transform if specified, is a path to a script that each test will be
     * piped to before injection.
     */
    transform?: TransformSpec,

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

const errorTemplates = {}

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

    tests: [],

    include: []

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
 * readFile reads the contents of a js file.
 */
const readJSFile = (path: string): Future<json.Object> =>
    attempt(() => require(path));

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

const execDriverScript =
    (driver: WebDriver, script: string, args: Value[] = []) =>
        doFuture(function*() {

            let result = yield liftP(() => driver.executeScript(script, ...args));
            return checkResult(result);

        });

const execAsyncDriverScript =
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

const execCLIScripts = (scripts: Path[] = [], args: string[] = []) =>
    sequential(scripts.map(target => execFile(target, args)));

const execBeforeScripts =
    (driver: WebDriver, conf: TestConf, args: string[] = []) =>
        execSpecScripts(driver, conf, conf.before, args);

const execAfterScripts =
    (driver: WebDriver, conf: TestConf, args: string[] = []) =>
        execSpecScripts(driver, conf, conf.after, args);

const execSpecScripts =
    (driver: WebDriver, conf: TestConf, scripts: ScriptSpec[], args: string[] = []) =>
        sequential(scripts.map(script => isStringType(script) ?
            execFile(resolve(script, path.dirname(conf.path)), args) :
            (<Function>script)(driver, conf)))

const runTestSuite = (conf: TestSuiteConf) =>
    doFuture(function*() {

        yield execCLIScripts(resolveAll(conf.before, path.dirname(conf.path)));

        yield sequential(conf.tests.map(t =>
            runTest(expandTestPath(conf,
                inheritScripts(conf,
                    inheritSuiteConf(conf, t))))
        ));

        yield execCLIScripts(resolveAll(conf.after, path.dirname(conf.path)));

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
            test[prop] = (<json.Object><object>conf)[prop];

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

    yield execBeforeScripts(driver, conf, [conf.path]);

    yield liftP(() => driver.get(conf.url));

    if (conf.injectMocha) {

        let js = yield readTextFile(FILE_MOCHA_JS);

        yield execDriverScript(driver, js);

    }

    yield execAsyncDriverScript(driver, SCRIPT_SETUP);

    let scriptPath = resolve(conf.path);

    let script = yield readTextFile(scriptPath);

    if (conf.transform)
        script = yield execTransformScript(conf, conf.transform, script);

    yield execDriverScript(driver, script);

    let result: json.Object = yield execAsyncDriverScript(driver, SCRIPT_RUN);

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

const execTransformScript =
    (conf: TestConf, trans: TransformSpec, src: string) =>
        isStringType(trans) ?
            fromCallback<string>(cb => {

                let cliPath = resolve(trans, path.dirname(conf.path));
                let proc = _execFile(cliPath, [conf.path], cb);
                let stdin = <stream.Writable>proc.stdin;
                stdin.write(src);
                stdin.end();

            }) :
            trans(conf, src);


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

    yield execAfterScripts(driver, conf, [conf.path]);

    return pure(<void>undefined);

});

/**
 * validateTestConf validates a single object as a TestConf.
 */
const validateTestConf: Precondition<ConfValue, TestConf> =
    and(isRecord, restrict({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        before: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        after: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        transform: <Precondition<ConfValue, ConfValue>>optional(
        or<ConfValue,ConfValue>(isString,isFunction))

    }));

/**
 * validateTestSuiteConf validates an entire test suite object.
 */
const validateTestSuiteConf: Precondition<ConfValue, TestSuiteConf> =
    and(isRecord, restrict({

        path: <Precondition<ConfValue, ConfValue>>isString,

        browser: <Precondition<ConfValue, ConfValue>>isString,

        url: <Precondition<ConfValue, ConfValue>>isString,

        injectMocha: <Precondition<ConfValue, ConfValue>>isBoolean,

        before: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString)),

        beforeEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

        after: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString)),

        afterEach: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(or<ConfValue, ConfValue>(isString, isFunction))),

                transform: <Precondition<ConfValue, ConfValue>>optional(
        or<ConfValue,ConfValue>(isString,isFunction)),

        tests: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(validateTestConf)),

        include: <Precondition<ConfValue, ConfValue>>and(isArray,
            arrayMap(isString))

    }));

const expandTargets = ['beforeEach', 'afterEach', 'transform'];

const expandScriptPaths = (conf: TestSuiteConf, path: Path) => {

    expandTargets.forEach(key => {

        let target = <ScriptSpec[]>conf[key];

        if (!target) return;

        conf[key] = Array.isArray(target) ?
            target.map(spec =>
                isStringType(spec) ? resolve(spec, path) : spec) :
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

            let jsFilePath = path.join(filePath, 'crapaud.js');

            filePath = (yield isFile(jsFilePath)) ?
                jsFilePath :
                path.join(filePath, 'crapaud.json');

        }

        let obj: TestSuiteConf = filePath.endsWith('.js') ?
            yield readJSFile(filePath) :
            yield readJSONFile(filePath);

        if (!isObject(obj)) {

            let err = new Error(`Test file at "${filePath}" is invalid!`);
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

/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
const readTestSuiteFileDeep = (filePath: string): Future<TestSuiteConf[]> =>
    doFuture(function*() {

        let conf = yield readTestSuiteFile(filePath);

        let work: Future<TestSuiteConf>[] = conf.include.map((i: string) =>
            readTestSuiteFileDeep(resolve(i, path.dirname(filePath))));

        let results = yield batch(distribute(work, 50));

        return pure([conf, ...flatten(results)]);

    });

const main = (options: CLIOptions) => doFuture(function*() {

    let confs: TestSuiteConf[] =
        yield readTestSuiteFileDeep(resolve(options.path));

    yield sequential(confs.map(conf => runTestSuite(conf)));

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
