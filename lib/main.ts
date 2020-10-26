#! /usr/bin/env node

import * as path from 'path';
import * as docopt from 'docopt';

import { Builder, WebDriver } from 'selenium-webdriver';

import {
    Future,
    doFuture,
    liftP,
    pure,
    raise
} from '@quenk/noni/lib/control/monad/future';
import { readTextFile } from '@quenk/noni/lib/io/file';
import { Value, Object } from '@quenk/noni/lib/data/json';

type ScriptResult = Object | void;

/**
 * Options used during execution, converted from command line input.
 */
interface Options {

    /**
     * file path containing test.
     */
    file: string,

    /**
     * url to access and run tests on.
     */
    url: string,

    /**
     * keepOpen if true will attempt to leave the browser open after testing.
     */
    keepOpen: boolean,

    /**
     * injectMocha if true, will automatically inject the mocha.js framework.
     */
    injectMocha: boolean,

    /**
     * browser we are testing.
     */
    browser: string,

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

const BIN = path.basename(__filename);

const defaultOptions = (args: Object): Options => ({

    file: <string>args['<file>'],

    url: <string>args['--url'],

    keepOpen: args['--keep-open'] ? true : false,

    injectMocha: args['--inject-mocha'] ? true : false,

    browser: getBrowser(args)

});

const getBrowser = (args: Object) => {

    let selected = args['--browser'] || process.env.BROWSER;

    return ((selected === 'firefox') || (selected === 'chrome')) ?
        selected : 'firefox';

}

const options: Options = defaultOptions(docopt.docopt(`

Usage:
   ${BIN} --url=URL [--keep-open] [--inject-mocha] [--browser=BROWSER] <file>

Options:
-h --help                  Show this screen.
--version                  Show the version of ${BIN}.
--url=URL                  The URL to open in the browser.
--keep-open                If specified, the browser window will remain open.
--inject-mocha             If specified, the mocha.js script will be dynamically
                           inserted to the page.
--browser=BROWSER          Specify the browser to run, either firefox (default)
                           or chrome.
`, { version: require('../package.json').version }));

let driver: WebDriver;

const resolve = (str: string) =>
    path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);

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

const onFinish = () => doFuture(function*() {

    if ((driver != null) && !(options.keepOpen))
        yield liftP(() => driver.quit());

    return pure(<void>undefined);

});

const onError = (e: Error) => {

    console.error(`An error occured while executing` +
        `"${options.url}": \n ${e.message} `);

    return raise<void>(e);

}

const onSuccess = (result: ScriptResult) => {

    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d: Value) => console.log(...<Value[]>d));

    return pure(<void>undefined);

}

const main = () => doFuture<ScriptResult>(function*() {

    let script = yield readTextFile(resolve(options.file));

    driver = yield liftP(() =>
        new Builder().forBrowser(options.browser).build());

    yield liftP(() => driver.get(options.url));

    if (options.injectMocha) {

        let js = yield readTextFile(FILE_MOCHA_JS);
        yield executeScript(driver, js);

    }

    yield executeAsyncScript(driver, SCRIPT_SETUP);

    yield executeScript(driver, script);

    let result = yield executeAsyncScript(driver, SCRIPT_RUN);

    return pure(<ScriptResult>result);

});

main()
    .chain(onSuccess)
    .catch(onError)
    .finally(onFinish)
    .fork();
