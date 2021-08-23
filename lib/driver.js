"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriver = exports.execAsyncDriverScript = exports.execDriverScript = void 0;
const selenium_webdriver_1 = require("selenium-webdriver");
const future_1 = require("@quenk/noni/lib/control/monad/future");
/**
 * execDriverScript
 */
const execDriverScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeScript(script, ...args));
    return checkResult(result);
});
exports.execDriverScript = execDriverScript;
/**
 * execAsyncDriverScript
 */
const execAsyncDriverScript = (driver, script, args = []) => future_1.doFuture(function* () {
    let result = yield future_1.liftP(() => driver.executeAsyncScript(script, ...args));
    return checkResult(result);
});
exports.execAsyncDriverScript = execAsyncDriverScript;
const checkResult = (result) => ((result != null) && (result.type === 'error')) ?
    future_1.raise(new Error(`Test failed: ${result.message} `)) :
    future_1.pure(result);
/**
 * getDriver from a string.
 */
const getDriver = (browser) => future_1.liftP(() => new selenium_webdriver_1.Builder()
    .forBrowser(browser)
    .build());
exports.getDriver = getDriver;
//# sourceMappingURL=driver.js.map