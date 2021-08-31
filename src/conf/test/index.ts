import * as path from 'path';
import * as json from '@quenk/noni/lib/data/json';

import { execFile as _execFile } from 'child_process';

import { WebDriver } from 'selenium-webdriver';

import { Path, } from '@quenk/noni/lib/io/file';
import {    Future} from '@quenk/noni/lib/control/monad/future';
import { merge } from '@quenk/noni/lib/data/record';

import { resolve } from '../../filesystem';
import { TestSuiteConf } from './suite';

/**
 * BeforeAfterSpec is the type of before and after scripts specified at 
 * the suite level.
 */
export type BeforeAfterSpec = Path | BeforeAfterFunc | ScriptInfo;

/**
 * BeforeAfterFunc is the type of the functions we execute for before and
 * after scripts.
 */
export type BeforeAfterFunc = (conf: TestSuiteConf) => Future<void>

/**
 * BeforeAfterEachSpec is the type of before and after scripts specified for
 * the test level.
 */
export type BeforeAfterEachSpec
    = Path
    | BeforeAfterEachFunc
    | ScriptInfo
    ;

/**
 * BeforeAfterEachFunc is the type of functions executed before and after each 
 * test.
 */
export type BeforeAfterEachFunc
    = (driver: WebDriver, conf: TestConf) => Future<void>
    ;

/**
 * TransformSpec is the type of transform scripts specified in the suite and 
 * test confs
 */
export type TransformSpec
    = Path
    | TransformFunc
    ;

/**
 * TransformFunc type for functions that transform the text source before
 * injection.
 */
export type TransformFunc
    = (conf: TestConf, path: Path, src: string) => Future<string>
    ;

export type ConfValue
    = json.Value
    | Function
    | ConfObject
    | ConfValue[]
    ;

/**
 * ScriptInfo indicates info about a script and how it should be executed.
 */
export interface ScriptInfo extends ConfObject {

    /**
     * path to the script to execute.
     */
    path: Path,

    /**
     * background if true will cause spawn() to be used instead of execFile
     */
    background?: boolean

}

/**
 * ConfObject is the parent interface of the suite and test conf objects.
 *
 * This is a mix of a json object that can also contain functions.
 */
export interface ConfObject {

    [key: string]: ConfValue

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
    before: BeforeAfterEachSpec | BeforeAfterEachSpec[],

    /**
     * after is a list of script paths to execute after the test.
     */
    after: BeforeAfterEachSpec | BeforeAfterEachSpec[],

    /**
     * transform if specified, is a path to a script that each test will be
     * piped to before injection.
     */
    transform?: TransformSpec | TransformSpec[],

    /**
     * keepOpen if true will attempt to leave the browser open after testing.
     */
    keepOpen: boolean,

}

const defaultTestConf: Partial<TestConf> = { before: [], after: [] }

/**
 * expandTestConf given a TestSuiteConf and a TestConf will make the TestConf
 * inherit the relevant properties of the TestSuiteConf.
 */
export const expandTestConf = (parent: TestSuiteConf, conf: TestConf) =>
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
    test.before = (<BeforeAfterEachSpec[]>conf.beforeEach).concat(test.before);
    test.after = (<BeforeAfterEachSpec[]>conf.afterEach).concat(test.after);
    return test;
}

const expandTestPath = (conf: TestSuiteConf, test: TestConf) => {
    test.path = resolve(test.path, path.dirname(conf.path));
    return test;
}
