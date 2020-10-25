#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const docopt = require("docopt");
const selenium_webdriver_1 = require("selenium-webdriver");
const future_1 = require("@quenk/noni/lib/control/monad/future");
const file_1 = require("@quenk/noni/lib/io/file");
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
    file: args['<file>'],
    url: args['--url'],
    keepOpen: args['--keep-open'] ? true : false
});
const args = defaultOptions(docopt.docopt(`

Usage:
   ${BIN} --url=URL [--keep-open] <file>

Options:
-h --help                  Show this screen.
--version                  Show the version of ${BIN}.
--url=URL                  The URL to open in the browser.
--keep-open                If specified, the browser window will remain open.
`, { version: require('../package.json').version }));
let driver;
const onFinish = () => future_1.doFuture(function* () {
    if ((driver != null) && !(args['keepOpen']))
        yield future_1.liftP(() => driver.quit());
    return future_1.pure(undefined);
});
const onError = (e) => {
    console.error(`An error occured while executing` +
        `"${args['url']}": \n ${e.message} `);
    return future_1.raise(e);
};
const onSuccess = (result) => {
    if ((result != null) && (Array.isArray(result.data)))
        result.data.forEach((d) => console.log(...d));
    return future_1.pure(undefined);
};
const resolve = (str) => path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);
const executeScript = (driver, script) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeScript(script));
    return checkResult(result);
});
const executeAsyncScript = (driver, script) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeAsyncScript(script));
    return checkResult(result);
});
const checkResult = (result) => ((result != null) && (result.type === 'error')) ?
    future_1.raise(new Error(`Test failed: ${result.message} `)) :
    future_1.pure(result);
const main = () => future_1.doFuture(function* () {
    let script = yield file_1.readTextFile(resolve(args['file']));
    driver = yield future_1.liftP(() => new selenium_webdriver_1.Builder().forBrowser('firefox').build());
    yield future_1.liftP(() => driver.get(args['url']));
    yield executeAsyncScript(driver, SCRIPT_SETUP);
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