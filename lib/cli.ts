import * as path from 'path';

import { execFile as _execFile } from 'child_process';

import {
    Future,
    doFuture,
    pure,
    raise,
    batch
} from '@quenk/noni/lib/control/monad/future';
import {
    isDirectory,
    isFile,
    Path,
} from '@quenk/noni/lib/io/file';
import { isObject, isString as isStringType } from '@quenk/noni/lib/data/type';
import { merge } from '@quenk/noni/lib/data/record';
import { distribute, flatten } from '@quenk/noni/lib/data/array';

import { TestSuiteConf  } from './conf/test/suite';
import { expandTestConf } from './conf/test';
import { readJSONFile, readJSFile, resolve } from './filesystem';
import { validateTestSuiteConf } from './validate';

const errorTemplates = {}

const defaultTestSuite: TestSuiteConf = {

    path: process.cwd(),

    browser: 'firefox',

    url: 'http://localhost:8080',

    injectMocha: true,

    mochaOptions: {},

    before: [],

    beforeEach: [],

    after: [],

    afterEach: [],

    keepOpen: false,

    tests: [],

    include: []

}

const expandTargets = ['beforeEach', 'afterEach', 'transform'];

const expandScriptPaths = (conf: TestSuiteConf, path: Path) => {

    expandTargets.forEach(key => {

        let target = <string[]>conf[key];

        if (!target) return;

        conf[key] = Array.isArray(target) ?
            target.map(spec =>
                isStringType(spec) ? resolve(spec, path) : spec) :
            isStringType(target) ? resolve(target, path) : target;

    });

    return conf;

}

/**
 * readTestSuiteFile reads a TestSuiteConf at a file path, initializing any
 * unspecified values to their defaults.
 *
 * This will also validate the object before it is returned.
 */
export const readTestSuiteFile = (filePath: string): Future<TestSuiteConf> =>
    doFuture(function*() {

        if (yield isDirectory(filePath)) {

            let jsFilePath = path.join(filePath, 'crapaud.js');

            filePath = (yield isFile(jsFilePath)) ?
                jsFilePath :
                path.join(filePath, 'crapaud.json');

        }

        let obj: TestSuiteConf = filePath.endsWith('.js') ?
            yield readJSFile(filePath) :
            yield readJSONFile(filePath);

        if (!isObject(obj)) {

            let err = new Error(`Test file at "${filePath}" is invalid!`);
            return raise<TestSuiteConf>(err);

        }

        (<TestSuiteConf>obj).path = filePath;

        let suite = merge(defaultTestSuite, obj);

        let testResult = validateTestSuiteConf(suite);

        if (testResult.isLeft()) {

            let msgs = testResult.takeLeft().explain(errorTemplates);
            return raise<TestSuiteConf>(new Error(JSON.stringify(msgs)));

        }

        let validSuite = expandScriptPaths(testResult.takeRight(),
            path.dirname(filePath));

        validSuite.tests = validSuite.tests.map(test =>
            expandTestConf(validSuite, test));

        return pure(validSuite);

    });

/**
 * readTestSuiteFileDeep takes care of reading a TestSuiteConf and any
 * includes recursively.
 *
 * TODO: This function should be made stack safe at some point.
 */
export const readTestSuiteFileDeep =
    (filePath: string): Future<TestSuiteConf[]> =>
        doFuture(function*() {

            let conf = yield readTestSuiteFile(filePath);

            let work: Future<TestSuiteConf>[] = conf.include.map((i: string) =>
                readTestSuiteFileDeep(resolve(i, path.dirname(filePath))));

            let results = yield batch(distribute(work, 50));

            return pure([conf, ...flatten(results)]);

        });
