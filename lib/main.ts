#! /usr/bin/env node

import * as path from 'path';
import * as os from 'os';
import * as docopt from 'docopt';

import { execFile } from 'child_process';
import { Builder, WebDriver } from 'selenium-webdriver';

import {
    Future,
    doFuture,
    fromCallback,
    sequential,
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
     * test file path containing test.
     */
    test: string,

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

    /**
     * before is a list of script paths to execute before the test.
     */
    before: string[],

    /**
     * after is a list of script paths to execute after the test.
     */
    after: string[]

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

    test: <string>args['--test'],

    url: <string>args['<url>'],

    keepOpen: args['--keep-open'] ? true : false,

    injectMocha: args['--inject-mocha'] ? true : false,

    browser: getBrowser(args),

    before: Array.isArray(args['--before']) ? <string[]>args['--before'] : [],

    after: Array.isArray(args['--after']) ? <string[]>args['--after'] : []

});

const getBrowser = (args: Object) => {

    let selected = args['--browser'] || process.env.BROWSER;

    return ((selected === 'firefox') || (selected === 'chrome')) ?
        selected : 'firefox';

}

const options: Options = defaultOptions(docopt.docopt(`

Usage:
   ${BIN} --test=PATH [--keep-open] [--inject-mocha] [--browser=BROWSER] 
          [--before=PATH...] [--after=PATH...] <url>

Options:
-h --help                  Show this screen.
--version                  Show the version of ${BIN}.
--test=PATH                The path to the test to run.
--keep-open                If specified, the browser window will remain open.
--inject-mocha             If specified, the mocha.js script will be dynamically
                           inserted to the page.
--browser=BROWSER          Specify the browser to run, either firefox (default)
                           or chrome.
--before=PATH              Specifies a command line script to execute before
                           running the test.
--after=PATH               Specifies a command line script to execute after
                           running the test.
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

const execScripts = (scripts: string[] = []) =>
    sequential(scripts.map(target => fromCallback(cb => {

        execFile(resolve(target), [options.test], (err, stdout, stderr) => {

            if (stdout) console.log(stdout);

            if (stderr) console.error(stderr);

            cb(err);

        });

    })));

const onError = (e: Error) => {

    console.error(`An error occured while executing tests for ` +
        `"${options.url}": ${os.EOL} ${e.message} `);

    return raise<void>(e);

}

const onSuccess = (result: ScriptResult) => {

    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d: Value) => console.log(...<Value[]>d));

    return pure(<void>undefined);

}

const onFinish = () => doFuture(function*() {

    if ((driver != null) && !(options.keepOpen))
        yield liftP(() => driver.quit());

    yield execScripts(options.after);

    return pure(<void>undefined);

});

const main = () => doFuture<ScriptResult>(function*() {

    driver = yield liftP(() =>
        new Builder().forBrowser(options.browser).build());

    yield liftP(() => driver.get(options.url));

    if (options.injectMocha) {

        let js = yield readTextFile(FILE_MOCHA_JS);
        yield executeScript(driver, js);

    }

    yield executeAsyncScript(driver, SCRIPT_SETUP);

    yield execScripts(options.before);

    let script = yield readTextFile(resolve(options.test));

    yield executeScript(driver, script);

    let result = yield executeAsyncScript(driver, SCRIPT_RUN);

    return pure(<ScriptResult>result);

});

main()
    .chain(onSuccess)
    .catch(onError)
    .finally(onFinish)
    .fork();
