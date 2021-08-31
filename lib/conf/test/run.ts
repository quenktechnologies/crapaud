import * as path from 'path';
import * as os from 'os';
import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';

import { WebDriver } from 'selenium-webdriver';

import { Path, readTextFile } from '@quenk/noni/lib/io/file';
import {
    doFuture,
    pure,
    raise,
    liftP,
    reduce,
    sequential,
} from '@quenk/noni/lib/control/monad/future';
import { Value } from '@quenk/noni/lib/data/json';
import { merge } from '@quenk/noni/lib/data/record';
import { isObject } from '@quenk/noni/lib/data/type';

import { resolve } from '../../filesystem';
import {
    execAsyncDriverScript,
    execDriverScript,
    getDriver,
    ScriptResult
} from '../../driver';
import { BeforeAfterEachFunc, BeforeAfterFunc, TestConf, TransformFunc } from '.';
import { TestSuiteConf } from './suite';

const FILE_MOCHA_JS = path.resolve(__dirname, '../../../vendor/mocha/mocha.js');

const SCRIPT_RUN = `
    let cb = arguments[arguments.length - 1];

    mocha.run(failures => {

        cb({ type: 'result', data: window.testmeh.buffer, failures });

    });
`;

const defaultMochaOpts = { ui: 'bdd', color: true, reporter: 'spec' };

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

/**
 * runTest executes a single test given a test configuration spec.
 */
export const runTest = (conf: TestConf) => doFuture(function*() {

    let driver = yield getDriver(conf.browser);

    yield execScripts(conf, driver,
        <BeforeAfterEachFunc[]>conf.before, [conf.path]);

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
        script = yield execTransformScripts(conf,
            <TransformFunc[]>conf.transform, scriptPath, script);

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

    yield execScripts(conf, driver,
        <BeforeAfterEachFunc[]>conf.after, [conf.path]);

    return pure(<void>undefined);

});

const execTransformScripts =
    (conf: TestConf, funcs: TransformFunc[], scriptPath: Path, txt: string) =>
        reduce(funcs, txt, (out, f: TransformFunc) => f(conf, scriptPath, out));

const execScripts = (
    conf: TestConf,
    driver: WebDriver,
    scripts: BeforeAfterEachFunc[],
    args: string[] = []) =>
    sequential(scripts.map((script: Function) =>
        script.apply(null, [conf, driver, ...args])));

/**
 * runTestSuite runs all the tests within a suite.
 */
export const runTestSuite = (conf: TestSuiteConf) =>
    doFuture(function*() {

        yield sequential((<BeforeAfterFunc[]>conf.before).map(f => f(conf)));

        yield sequential(conf.tests.map(runTest));

        yield sequential((<BeforeAfterFunc[]>conf.after).map(f => f(conf)));

        return pure(undefined);

    });

const defaultTestConf: Partial<TestConf> = { before: [], after: [] }

/**
 * expandTestConf given a TestSuiteConf and a TestConf will make the TestConf
 * inherit the relevant properties of the TestSuiteConf.
 */
export const expandTestConf = (parent: TestSuiteConf, conf: TestConf) =>
    expandTestPath(parent, inheritScripts(parent, inheritSuiteConf(parent,
        merge(defaultTestConf, conf))));

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
    test.before = (<BeforeAfterEachFunc[]>conf.beforeEach)
        .concat(<BeforeAfterEachFunc>test.before);

    test.after = (<BeforeAfterEachFunc[]>conf.afterEach)
        .concat(<BeforeAfterEachFunc>test.after);

    return test;

}

const expandTestPath = (conf: TestSuiteConf, test: TestConf) => {
    test.path = resolve(test.path, path.dirname(conf.path));
    return test;
}
