#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const os = require("os");
const docopt = require("docopt");
const child_process_1 = require("child_process");
const selenium_webdriver_1 = require("selenium-webdriver");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
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
const defaultOptions = (args) => ({
    test: args['--test'],
    url: args['<url>'],
    keepOpen: args['--keep-open'] ? true : false,
    injectMocha: args['--inject-mocha'] ? true : false,
    browser: getBrowser(args),
    before: Array.isArray(args['--before']) ? args['--before'] : [],
    after: Array.isArray(args['--after']) ? args['--after'] : []
});
const getBrowser = (args) => {
    let selected = args['--browser'] || process.env.BROWSER;
    return ((selected === 'firefox') || (selected === 'chrome')) ?
        selected : 'firefox';
};
const options = defaultOptions(docopt.docopt(`

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
let driver;
const resolve = (str) => path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);
const executeScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeScript(script, ...args));
    return checkResult(result);
});
const executeAsyncScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeAsyncScript(script, ...args));
    return checkResult(result);
});
const checkResult = (result) => ((result != null) && (result.type === 'error')) ?
    future_1.raise(new Error(`Test failed: ${result.message} `)) :
    future_1.pure(result);
const execScripts = (scripts = []) => future_1.sequential(scripts.map(target => future_1.fromCallback(cb => {
    child_process_1.execFile(resolve(target), [options.test], (err, stdout, stderr) => {
        if (stdout)
            console.log(stdout);
        if (stderr)
            console.error(stderr);
        cb(err);
    });
})));
const onError = (e) => {
    console.error(`An error occured while executing tests for ` +
        `"${options.url}": ${os.EOL} ${e.message} `);
    return future_1.raise(e);
};
const onSuccess = (result) => {
    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d) => console.log(...d));
    return future_1.pure(undefined);
};
const onFinish = () => future_1.doFuture(function* () {
    if ((driver != null) && !(options.keepOpen))
        yield future_1.liftP(() => driver.quit());
    yield execScripts(options.after);
    return future_1.pure(undefined);
});
const main = () => future_1.doFuture(function* () {
    driver = yield future_1.liftP(() => new selenium_webdriver_1.Builder().forBrowser(options.browser).build());
    yield future_1.liftP(() => driver.get(options.url));
    if (options.injectMocha) {
        let js = yield file_1.readTextFile(FILE_MOCHA_JS);
        yield executeScript(driver, js);
    }
    yield executeAsyncScript(driver, SCRIPT_SETUP);
    yield execScripts(options.before);
    let script = yield file_1.readTextFile(resolve(options.test));
    yield executeScript(driver, script);
    let result = yield executeAsyncScript(driver, SCRIPT_RUN);
    return future_1.pure(result);
});
main()
    .chain(onSuccess)
    .catch(onError)
    .finally(onFinish)
    .fork();
//# sourceMappingURL=main.js.map