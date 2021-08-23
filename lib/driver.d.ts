import * as json from '@quenk/noni/lib/data/json';
import { WebDriver } from 'selenium-webdriver';
import { Future } from '@quenk/noni/lib/control/monad/future';
import { Value } from '@quenk/noni/lib/data/json';
export declare type ScriptResult = json.Object | void;
/**
 * execDriverScript
 */
export declare const execDriverScript: (driver: WebDriver, script: string, args?: Value[]) => Future<ScriptResult>;
/**
 * execAsyncDriverScript
 */
export declare const execAsyncDriverScript: (driver: WebDriver, script: string, args?: Value[]) => Future<ScriptResult>;
/**
 * getDriver from a string.
 */
export declare const getDriver: (browser: string) => Future<WebDriver>;
