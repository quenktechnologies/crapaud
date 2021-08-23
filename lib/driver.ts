import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';
import { Builder, WebDriver } from 'selenium-webdriver';

import {
    Future,
    doFuture,
    liftP,
    pure,
    raise,
} from '@quenk/noni/lib/control/monad/future';
import { Value } from '@quenk/noni/lib/data/json';

export type ScriptResult = json.Object | void;

/**
 * execDriverScript
 */
export const execDriverScript =
    (driver: WebDriver, script: string, args: Value[] = []) =>
        doFuture(function*() {

            let result = yield liftP(() =>
                driver.executeScript(script, ...args));

            return checkResult(result);

        });

/**
 * execAsyncDriverScript
 */
export const execAsyncDriverScript =
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

/**
 * getDriver from a string.
 */
export const getDriver = (browser: string) => liftP(() =>
    new Builder()
        .forBrowser(browser)
        .build()
);
