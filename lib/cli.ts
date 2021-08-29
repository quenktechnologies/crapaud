import * as path from 'path';
import * as os from 'os';
import * as stream from 'stream';
import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';

import { WebDriver } from 'selenium-webdriver';

import {
    Future,
    doFuture,
    fromCallback,
    sequential,
    liftP,
    pure,
    raise,
    batch
} from '@quenk/noni/lib/control/monad/future';
import {
    isDirectory,
    isFile,
    Path,
    readTextFile
} from '@quenk/noni/lib/io/file';
import { Value } from '@quenk/noni/lib/data/json';
import { isObject, isString as isStringType } from '@quenk/noni/lib/data/type';
import { merge } from '@quenk/noni/lib/data/record';
import { distribute, flatten } from '@quenk/noni/lib/data/array';

import { readJSONFile, readJSFile, resolve } from './filesystem';
import { validateTestSuiteConf } from './validate';
import { TestSuiteConf, TestConf, ScriptSpec, TransformSpec, HookFunc } from './conf';
import { execAsyncDriverScript, execDriverScript, getDriver, ScriptResult } from './driver';

const FILE_MOCHA_JS = path.resolve(__dirname, '../vendor/mocha/mocha.js');

const setupScript = (conf: object = {}) => `

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

const SCRIPT_RUN = `
    let cb = arguments[arguments.length - 1];

    mocha.run(failures => {

        cb({ type: 'result', data: window.testmeh.buffer, failures });

    });
`;

const errorTemplates = {}

const defaultMochaOpts = { ui: 'bdd', color: true, reporter: 'spec' };

const defaultTestSuite: TestSuiteConf = {

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

}

const defaultTestConf: Partial<TestConf> = {

    before: [],

    after: []

}

const execBeforeScripts =
    (driver: WebDriver, conf: TestConf, args: string[] = []) =>
        execSpecScripts(driver, conf, conf.before, args);

const execAfterScripts =
    (driver: WebDriver, conf: TestConf, args: string[] = []) =>
        execSpecScripts(driver, conf, conf.after, args);

const execSpecScripts = (
    _driver: WebDriver,
    conf: TestConf,
    scripts: ScriptSpec[],
    _args: string[] = []) => 
     sequential(scripts.map(script => (<Function>script)(conf)))

const expandTestConf = (parent: TestSuiteConf, conf: TestConf) =>
    expandTestPath(parent,
        inheritScripts(parent,
            inheritSuiteConf(parent, merge(defaultTestConf, conf))));

const inheritedProps = [
    'browser',
    'url',
    'injectMocha',
    'mochaOptions',
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

const execTransformScript =
    (conf: TestConf, trans: TransformSpec, scriptPath: Path, txt: string) =>
        isStringType(trans) ?
            fromCallback<string>(cb => {

                let cliPath = resolve(trans, path.dirname(conf.path));
                let proc = _execFile(cliPath, [conf.path], cb);
                let stdin = <stream.Writable>proc.stdin;
                stdin.write(txt);
                stdin.end();

            }) :
            trans(conf, scriptPath, txt);

const expandTargets = ['beforeEach', 'afterEach', 'transform'];

const expandScriptPaths = (conf: TestSuiteConf, path: Path) => {

    expandTargets.forEach(key => {

        let target = <ScriptSpec[]>conf[key];

        if (!target) return;

        conf[key] = Array.isArray(target) ?
            target.map(spec =>
                isStringType(spec) ? resolve(spec, path) : spec) :
            isStringType(target) ? resolve(target, path) : target;

    });

    return conf;

}

/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
export const readTestSuiteFile = (filePath: string): Future<TestSuiteConf> =>
    doFuture(function*() {

        if (yield isDirectory(filePath)) {

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

        let testResult = validateTestSuiteConf(suite);

        if (testResult.isLeft()) {

            let msgs = testResult.takeLeft().explain(errorTemplates);
            return raise<TestSuiteConf>(new Error(JSON.stringify(msgs)));

        }

        let validSuite = expandScriptPaths(testResult.takeRight(),
            path.dirname(filePath));

        validSuite.tests = validSuite.tests.map(test =>
            expandTestConf(validSuite, test));

        return pure(validSuite);

    });

/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
export const readTestSuiteFileDeep =
    (filePath: string): Future<TestSuiteConf[]> =>
        doFuture(function*() {

            let conf = yield readTestSuiteFile(filePath);

            let work: Future<TestSuiteConf>[] = conf.include.map((i: string) =>
                readTestSuiteFileDeep(resolve(i, path.dirname(filePath))));

            let results = yield batch(distribute(work, 50));

            return pure([conf, ...flatten(results)]);

        });

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

    let mochaConf = merge(defaultMochaOpts, conf.mochaOptions ?
        conf.mochaOptions : {});

    yield execAsyncDriverScript(driver, setupScript(mochaConf));

    let scriptPath = resolve(conf.path);

    let script = yield readTextFile(scriptPath);

    if (conf.transform)
        script = yield execTransformScript(conf, conf.transform, scriptPath,
            script);

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
 * runTestSuite runs all the tests within a suite.
 */
export const runTestSuite = (conf: TestSuiteConf) =>
    doFuture(function*() {

        yield sequential((<HookFunc[]>conf.before).map(f => f(conf)));

        yield sequential(conf.tests.map(runTest));

        yield sequential((<HookFunc[]>conf.after).map(f => f(conf)));

        return pure(undefined);

    });