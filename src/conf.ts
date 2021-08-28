import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';
import { WebDriver } from 'selenium-webdriver';

import {
    Future,
} from '@quenk/noni/lib/control/monad/future';
import { Path } from '@quenk/noni/lib/io/file';

export type ScriptFunc = (driver: WebDriver, conf: TestConf) => Future<void>

export type HookFunc = (conf: TestSuiteConf) => Future<void>

export type BeforeScriptSpec = Path | HookFunc;

export type ScriptSpec
    = Path
    | ScriptFunc
    ;

export type TransformScript
    = (conf: TestConf, path: Path, src: string) => Future<string>
    ;

export type TransformSpec
    = Path
    | TransformScript
    ;

export type ConfValue
    = json.Value
    | Function
    | ConfObject
    | ConfValue[]
    ;

/**
 * ConfObject is the parent interface of the suite and test conf objects.
 *
 * This is a mix of a json object that can also contain functions.
 */
export interface ConfObject {

    [key: string]: ConfValue

}

/**
 * TestSuiteConf contains configuration info for a group of tests.
 */
export interface TestSuiteConf extends ConfObject {

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
     * mochaOptions that will be stringified and injected into mocha.setup().
     */
    mochaOptions: ConfObject,

    /**
     * before is a list of script paths to execute before testing.
     */
    before: (Path | HookFunc)[],

    /**
     * beforeEach is a list of script paths to execute before each test.
     */
    beforeEach: ScriptSpec[],

    /**
     * after is a list of script paths to execute after testing.
     */
    after: (Path | HookFunc)[],

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
export interface TestConf extends ConfObject {

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
     * mochaOptions that will be stringified and injected into mocha.setup().
     */
    mochaOptions: ConfObject,

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
